import { api } from '../auth-client.js';
import { actions, forms } from '../lib/events.js';
import { closeModal, esc, mhead, openModal, toast } from '../lib/dom.js';
import { S, household } from '../lib/state.js';

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
const timezones = () => [browserTimezone(), ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone').filter((zone) => zone !== browserTimezone()) : [])];

export function householdSwitcherHtml() {
  const current = household();
  return `<details class="household-switcher">
    <summary aria-label="Roomie. Current household: ${esc(current.householdName)}"><span class="household-switcher-title"><b>Roomie</b><small class="truncate">${esc(current.householdName)}</small></span></summary>
    <div class="household-switcher-menu" aria-label="Choose a household">
      ${S.households.map((h) => `<button type="button" class="household-switcher-option ${h.householdId === S.hid ? 'selected' : ''}" data-action="switch-household" data-id="${h.householdId}" aria-pressed="${h.householdId === S.hid}">
        <span class="grow"><b>${esc(h.householdName)}</b><small>${esc(h.address || (h.role === 'owner' ? 'Owner' : 'Member'))}</small></span>${h.householdId === S.hid ? '<span aria-hidden="true">✓</span>' : ''}
      </button>`).join('')}
      <div class="household-switcher-divider"></div>
      <button type="button" class="household-switcher-add" data-action="add-household">＋ Add a household</button>
    </div>
  </details>`;
}

function showAddHousehold() {
  document.querySelector('.household-switcher[open]')?.removeAttribute('open');
  const timezone = browserTimezone();
  openModal(`${mhead('Add a household')}<div class="household-add-options">
    <form class="card stack" data-form="add-household-join"><h3>Join a household</h3>
      <label class="fld"><span>Join code</span><input class="input code" name="joinCode" required maxlength="20" autocapitalize="characters" autocomplete="off" placeholder="MAPLE412"></label>
      <div class="err" role="alert"></div><button class="btn p" type="submit">Join household</button>
    </form>
    <form class="card stack" data-form="add-household-create"><h3>Create a household</h3>
      <label class="fld"><span>Household name</span><input class="input" name="householdName" required maxlength="80" placeholder="412 Maple St"></label>
      <label class="fld"><span>Address (optional)</span><input class="input" name="address" maxlength="200"></label>
      <label class="fld"><span>Timezone</span><select class="input" name="timezone" required>${timezones().map((zone) => `<option value="${esc(zone)}" ${zone === timezone ? 'selected' : ''}>${esc(zone)}</option>`).join('')}</select></label>
      <div class="err" role="alert"></div><button class="btn" type="submit">Create household</button>
    </form>
  </div>`);
}

function selectHousehold(householdId, { onboarding = false } = {}) {
  S.hid = householdId;
  S.navCounts = { overdue: 0, at: 0, hid: null };
  localStorage.setItem('roomie.hid', String(householdId));
  if (onboarding) sessionStorage.setItem('roomie.onboarding.step', '3');
  window.dispatchEvent(new Event(onboarding ? 'roomie:reload' : 'roomie:render'));
}

async function addHousehold(request, form) {
  try {
    const result = await request();
    const selected = S.households.find((h) => h.householdId === result.householdId);
    closeModal();
    // Newly joined or created memberships need the household setup steps. /me refreshes the
    // membership list and onboarding timestamp before the app decides whether to show them.
    selectHousehold(result.householdId, { onboarding: !selected?.onboardedAt });
    toast('Household added');
  } catch (error) {
    showError(form, error.message);
  }
}

actions['switch-household'] = (el) => {
  const id = Number(el.dataset.id);
  if (!S.households.some((h) => h.householdId === id) || id === S.hid) {
    el.closest('.household-switcher')?.removeAttribute('open');
    return;
  }
  selectHousehold(id);
};

actions['add-household'] = showAddHousehold;

forms['add-household-join'] = (form) => addHousehold(
  () => api('/households/join', { method: 'POST', body: { joinCode: new FormData(form).get('joinCode') } }), form,
);

forms['add-household-create'] = (form) => {
  const data = new FormData(form);
  return addHousehold(() => api('/households', { method: 'POST', body: {
    householdName: data.get('householdName'), address: data.get('address'), timezone: data.get('timezone'),
  } }), form);
};

import { actions, forms } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, badge, esc, fmtDate, fullName, phead, showError, toast } from '../lib/dom.js';

const PAYMENT_APPS = [['venmo', 'Venmo'], ['zelle', 'Zelle'], ['apple_cash', 'Apple Cash']];

function profileForm() {
  const methods = Object.fromEntries((S.user.paymentMethods ?? []).map((m) => [m.app, m]));
  const preferred = (S.user.paymentMethods ?? []).find((m) => m.isPreferred)?.app ?? 'venmo';
  return `<section class="card profile-card"><div class="row sp"><div><h2>Your profile</h2><p class="body-copy">Help roommates recognize you and know where to send their share.</p></div>${avatar(S.user, 'lg')}</div>
    <form class="stack" data-form="profile" autocomplete="on">
      <div class="inline-grid"><label class="fld"><span>First name</span><input class="input" name="firstName" autocomplete="given-name" maxlength="80" required value="${esc(S.user.firstName)}"></label>
        <label class="fld"><span>Last name</span><input class="input" name="lastName" autocomplete="family-name" maxlength="80" value="${esc(S.user.lastName)}"></label></div>
      <div class="inline-grid"><label class="fld"><span>Phone (optional)</span><input class="input" name="phoneNumber" type="tel" autocomplete="tel" maxlength="40" value="${esc(S.user.phoneNumber ?? '')}" placeholder="(801) 555-0123"></label>
        <label class="fld"><span>Profile photo URL (optional)</span><input class="input" name="profilePhoto" type="url" inputmode="url" maxlength="500" value="${esc(S.user.profilePhoto ?? '')}" placeholder="https://…"></label></div>
      <fieldset class="payment-editor"><legend>Payment apps</legend><p class="hint">Add any handles roommates can use. Leave an app blank to remove it.</p>
        <div class="payment-fields">${PAYMENT_APPS.map(([app, label]) => `<label class="fld"><span>${label}</span><input class="input" name="pay_${app}" maxlength="120" value="${esc(methods[app]?.username ?? '')}" placeholder="${app === 'venmo' ? '@username' : 'Phone or email'}"></label>`).join('')}</div>
        <label class="fld preferred-app"><span>Preferred app</span><select class="input" name="preferred">${PAYMENT_APPS.map(([app, label]) => `<option value="${app}" ${preferred === app ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      </fieldset>
      <div class="err" role="alert"></div><div class="acts"><button class="btn p" type="submit">Save profile</button></div>
    </form></section>`;
}

export async function settingsView() {
  const h = household();
  const { members } = await api(`/households/${h.householdId}/members`);
  const current = members.filter((m) => !m.leftDate), former = members.filter((m) => m.leftDate);
  const row = (m) => `<div class="item row">${avatar(m)}<div class="grow"><b>${esc(fullName(m))}</b>${m.userId === S.user.userId ? ' <span class="mute">(you)</span>' : ''}
      <div class="mute" style="font-size:13px">${m.leftDate ? `Moved out ${fmtDate(m.leftDate, h.timezone)}` : `Joined ${fmtDate(m.joinedDate, h.timezone)}`}</div></div>${badge(m.role === 'owner' ? 'Owner' : 'Member', m.leftDate ? 'gray' : '')}</div>`;
  return `${phead('Your space', 'Settings', `The people and details behind ${esc(h.householdName)}.`)}
  <div class="page-content stack"><div class="grid2 equal-cards">
    <section class="card"><h2>Invite roommates</h2>
      <p class="body-copy">Share this code with the people you live with. Anyone who signs up can join with it.</p>
      <div class="rowline"><span class="code">${esc(h.joinCode)}</span><button class="btn s" data-action="copy-code" data-code="${esc(h.joinCode)}">Copy</button></div>
      <hr class="hr"><div class="rowline timezone-row"><span class="mute">Household timezone</span><span>${esc(h.timezone)}</span></div>
    </section>
    <section class="card"><h2>You</h2>
      <div class="item row">${avatar(S.user)}<div class="grow"><b>${esc(fullName(S.user))}</b><div class="mute" style="font-size:13px">${esc(S.user.email)}</div></div></div>
      <div class="acts" style="justify-content:flex-start;margin-top:12px"><button class="btn d" data-action="signout">Sign out</button></div>
    </section>
  </div>
  ${profileForm()}
  <section class="card"><h2>Household members</h2>${current.map(row).join('')}
    ${former.length ? `<div class="eyebrow" style="margin-top:16px">Moved out</div>${former.map(row).join('')}` : ''}</section></div>`;
}

actions['copy-code'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.code); toast('Join code copied'); } catch { toast(`Your code is ${el.dataset.code}`); } };

forms.profile = async (form) => {
  const data = new FormData(form), preferred = String(data.get('preferred'));
  const paymentMethods = PAYMENT_APPS.flatMap(([app]) => {
    const username = String(data.get(`pay_${app}`) ?? '').trim();
    return username ? [{ app, username, isPreferred: app === preferred }] : [];
  });
  try {
    const saved = await api('/me', { method: 'PATCH', body: {
      firstName: data.get('firstName'), lastName: data.get('lastName'), phoneNumber: data.get('phoneNumber'), profilePhoto: data.get('profilePhoto'), paymentMethods,
    } });
    S.user = saved.user; toast('Profile saved'); window.dispatchEvent(new Event('roomie:render'));
  } catch (error) { showError(form, error.message); }
};

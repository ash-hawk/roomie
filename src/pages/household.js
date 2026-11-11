import { actions, forms } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, badge, closeModal, confirmDialog, esc, fmtDate, fullName, ico, mhead, openModal, phead, toast } from '../lib/dom.js';

const PAYMENT_APPS = { venmo: 'Venmo', zelle: 'Zelle', apple_cash: 'Apple Cash' };
let members = [];

const memberRow = (m, h) => `<div class="item row click-row roommate-row" role="button" tabindex="0" data-action="roommate-profile" data-id="${m.userId}" aria-label="View ${esc(fullName(m))}'s profile">
  ${avatar(m)}<div class="grow"><b>${esc(fullName(m))}</b>${m.userId === S.user.userId ? ' <span class="mute">(you)</span>' : ''}
  <div class="mute" style="font-size:13px">${m.leftDate ? `Moved out ${fmtDate(m.leftDate, h.timezone)}` : `Joined ${fmtDate(m.joinedDate, h.timezone)}`}</div></div>
  ${badge(m.role === 'owner' ? 'Owner' : 'Member', m.leftDate ? 'gray' : '')}<span class="row-chevron">${ico('chevron', 16)}</span></div>
  ${household()?.role === 'owner' && !m.leftDate && m.userId !== S.user.userId ? `<div class="row" style="justify-content:flex-end;gap:8px;margin:-8px 0 12px">
    <button class="btn s" data-action="transfer-owner" data-id="${m.userId}" data-name="${esc(fullName(m))}">Transfer ownership</button>
    ${m.role === 'member' ? `<button class="btn s d" data-action="remove-member" data-id="${m.userId}" data-name="${esc(fullName(m))}">Remove</button>` : ''}
  </div>` : ''}`;

export async function householdView() {
  const h = household(), response = await api(`/households/${h.householdId}/members`);
  members = response.members;
  const current = members.filter((m) => !m.leftDate), former = members.filter((m) => m.leftDate);
  const owner = h.role === 'owner';
  const invite = owner ? `<hr class="hr">
        <h3>Invite roommates</h3>
        <p class="mute invite-description">Share this code. Anyone who signs up can join with it.</p>
        <div class="rowline">
          <span class="code">${esc(h.joinCode)}</span>
          <button class="btn" data-action="copy-code" data-code="${esc(h.joinCode)}">Copy code</button>
          <button class="btn" data-action="rotate-join-code">Regenerate</button>
        </div>` : `<hr class="hr"><p class="mute">Only household owners can view or manage the invite code.</p>`;
  const settings = owner ? `<details class="household-admin" style="margin-top:16px">
        <summary>Edit household details</summary>
        <form class="stack" data-form="household-settings" style="margin-top:12px">
          <label class="fld"><span>Household name</span><input class="input" name="householdName" maxlength="80" required value="${esc(h.householdName)}"></label>
          <label class="fld"><span>Address (optional)</span><input class="input" name="address" maxlength="200" value="${esc(h.address ?? '')}"></label>
          <label class="fld"><span>Timezone</span><input class="input" name="timezone" maxlength="60" required value="${esc(h.timezone)}"></label>
          <label class="fld"><span>Theme color</span><input class="input" name="themeColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(h.themeColor ?? '') ? h.themeColor : '#4338ca'}"></label>
          <div class="err" role="alert"></div><div class="acts"><button class="btn p" type="submit">Save household details</button></div>
        </form>
      </details>` : '';

  return `${phead('Household')}
    <div class="stack">
      <section class="card invite-card">
        <h2>${esc(h.householdName)}</h2>
        <p class="mute">${current.length} ${current.length === 1 ? 'member' : 'members'} · ${esc(h.timezone)}</p>

        ${settings}
        ${invite}

        <hr class="hr">
        <h3>Roommates</h3>
        ${current.map((m) => memberRow(m, h)).join('')}
        ${former.length ? `
          <details style="margin-top:16px">
            <summary>Former roommates (${former.length})</summary>
            ${former.map((m) => memberRow(m, h)).join('')}
          </details>
        ` : ''}
        ${owner ? `<hr class="hr"><div class="stack"><h3>Danger zone</h3><p class="mute">Deleting this household permanently removes its shared data for everyone.</p>
          <div><button class="btn d" data-action="delete-household">Delete household</button></div></div>` : ''}
      </section>
    </div>`;
}

actions['copy-code'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.code); toast('Join code copied'); } catch { toast(`Your code is ${el.dataset.code}`); } };
forms['household-settings'] = async (form) => {
  const data = new FormData(form);
  const saved = await api(`/households/${S.hid}`, { method: 'PATCH', body: {
    householdName: data.get('householdName'), address: data.get('address'),
    timezone: data.get('timezone'), themeColor: data.get('themeColor'),
  } });
  Object.assign(household(), saved.household);
  toast('Household details saved');
  window.dispatchEvent(new Event('roomie:render'));
};
actions['rotate-join-code'] = async () => {
  if (!await confirmDialog('Regenerate invite code?', 'The old code will stop working immediately.', 'Regenerate')) return;
  const saved = await api(`/households/${S.hid}/join-code`, { method: 'POST', body: {} });
  household().joinCode = saved.joinCode;
  toast('Invite code regenerated');
  window.dispatchEvent(new Event('roomie:render'));
};
actions['transfer-owner'] = async (el) => {
  if (!await confirmDialog('Transfer ownership?', `${el.dataset.name} will become the household owner, and you will become a member.`, 'Transfer')) return;
  await api(`/households/${S.hid}/members/${el.dataset.id}`, { method: 'PATCH', body: {} });
  const me = await api('/me');
  S.households = me.households;
  toast('Household ownership transferred');
  window.dispatchEvent(new Event('roomie:render'));
};
actions['remove-member'] = async (el) => {
  if (!await confirmDialog('Remove roommate?', `${el.dataset.name} will lose access to this household. Their past activity will remain in household history.`, 'Remove')) return;
  await api(`/households/${S.hid}/members/${el.dataset.id}`, { method: 'DELETE' });
  toast('Roommate removed');
  window.dispatchEvent(new Event('roomie:render'));
};
actions['delete-household'] = async () => {
  const h = household();
  if (!await confirmDialog('Delete household?', `This permanently deletes ${h.householdName} and all of its shared data. This cannot be undone.`, 'Delete household')) return;
  await api(`/households/${S.hid}`, { method: 'DELETE' });
  S.households = S.households.filter((item) => item.householdId !== S.hid);
  S.hid = S.households[0]?.householdId ?? null;
  if (S.hid) localStorage.setItem('roomie.hid', String(S.hid));
  else localStorage.removeItem('roomie.hid');
  toast('Household deleted');
  window.dispatchEvent(new Event('roomie:render'));
};
actions['roommate-profile'] = (el) => {
  const m = members.find((member) => member.userId === Number(el.dataset.id)); if (m) openRoommateProfile(m);
};
export function openRoommateProfile(m) {
  const methods = [...(m.paymentMethods ?? [])].sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred));
  const contact = m.leftDate ? '<p class="mute">Contact details are hidden for former roommates.</p>' : `<div class="profile-contact">
    <div><span class="hint">Email</span><b>${m.email ? `<a href="mailto:${encodeURIComponent(m.email)}">${esc(m.email)}</a>` : 'Not added'}</b></div>
    <div><span class="hint">Phone</span><b>${m.phoneNumber ? `<a href="tel:${encodeURIComponent(m.phoneNumber)}">${esc(m.phoneNumber)}</a>` : 'Not added'}</b></div></div>`;
  const payments = !m.leftDate && methods.length ? `<div class="stack roommate-payments">${methods.map((method) => `<div class="item row"><div class="grow"><b>${esc(PAYMENT_APPS[method.app] ?? method.app)}</b><div class="hint">${esc(method.username)}</div></div>${method.isPreferred ? badge('Preferred') : ''}</div>`).join('')}</div>` : '<p class="mute">No payment methods added.</p>';
  openModal(`${mhead(esc(fullName(m)))}<div class="roommate-profile-head">${avatar(m, 'lg')}<div><h3>${esc(fullName(m))}</h3><p class="mute">${m.role === 'owner' ? 'Household owner' : 'Household member'}</p></div></div>
    <h4>Contact</h4>${contact}<h4>Payment methods</h4>${payments}
    ${m.userId === S.user.userId ? '<div class="acts"><button class="btn p" data-action="open-profile">Edit my profile</button></div>' : ''}`);
}
actions['open-profile'] = () => { closeModal(); location.hash = '#/settings'; };

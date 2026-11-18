import { actions, forms } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, badge, closeModal, confirmDialog, esc, fmtDate, fullName, ico, mhead, openModal, phead, toast } from '../lib/dom.js';

const PAYMENT_APPS = { venmo: 'Venmo', zelle: 'Zelle', apple_cash: 'Apple Cash' };
let members = [];

const memberRow = (m, h) => `<div class="roommate-entry"><div class="item row click-row roommate-row" role="button" tabindex="0" data-action="roommate-profile" data-id="${m.userId}" aria-label="View ${esc(fullName(m))}'s profile">
  ${avatar(m)}<div class="grow"><b>${esc(fullName(m))}</b>${m.userId === S.user.userId ? ' <span class="mute">(you)</span>' : ''}
  <div class="mute" style="font-size:13px">${m.leftDate ? `Moved out ${fmtDate(m.leftDate, h.timezone)}` : `Joined ${fmtDate(m.joinedDate, h.timezone)}`}</div></div>
  ${badge(m.role === 'owner' ? 'Owner' : 'Member', m.leftDate ? 'gray' : '')}<span class="row-chevron">${ico('chevron', 16)}</span></div>
  </div>`;

export async function householdView() {
  const h = household(), response = await api(`/households/${h.householdId}/members`);
  members = response.members;
  const current = members.filter((m) => !m.leftDate);
  const owner = h.role === 'owner';
  const invite = owner ? `<section class="card invite-card" aria-labelledby="invite-roommates-title">
        <h2 id="invite-roommates-title">Invite roommates</h2>

        <div class="rowline">
          <span class="code">${esc(h.joinCode)}</span>
          <button class="btn" data-action="copy-code" data-code="${esc(h.joinCode)}">Copy code</button>
          <button class="btn" data-action="rotate-join-code">Regenerate</button>
        </div></section>` : '';
  const settings = owner ? `<details class="household-admin" style="margin-top:16px">
        <summary>Edit household details</summary>
        <form class="stack" data-form="household-settings" style="margin-top:12px">
          <label class="fld"><span>Household name</span><input class="input" name="householdName" maxlength="80" required value="${esc(h.householdName)}"></label>
          <label class="fld"><span>Address (optional)</span><input class="input" name="address" maxlength="200" value="${esc(h.address ?? '')}"></label>
          <label class="fld"><span>Timezone</span><input class="input" name="timezone" maxlength="60" required value="${esc(h.timezone)}"></label>
          <div class="err" role="alert"></div><div class="acts"><button class="btn p" type="submit">Save household details</button></div>
        </form>
      </details>` : '';

  return `${phead('Household')}
    <div class="stack">
      ${invite}
      <section class="card roommate-card" aria-labelledby="roommates-title">
        <div class="row sp"><h2 id="roommates-title">Roommates</h2><span class="hint">${current.length} members</span></div>
        ${current.map((m) => memberRow(m, h)).join('')}
      </section>
      <section class="card household-card" aria-labelledby="household-details-title">
        <h2 id="household-details-title">Household details</h2>
        <p><b>${esc(h.householdName)}</b></p>
        <p class="mute">${esc(h.timezone)}</p>
        ${settings}
        <div class="acts household-lifecycle">${owner ? '<button class="btn" data-action="delete-household">Delete household</button>' : '<button class="btn" data-action="leave-household">Leave household</button>'}</div>
      </section>
    </div>`;
}

actions['copy-code'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.code); toast('Join code copied'); } catch { toast(`Your code is ${el.dataset.code}`); } };
forms['household-settings'] = async (form) => {
  const data = new FormData(form);
  const saved = await api(`/households/${S.hid}`, { method: 'PATCH', body: {
    householdName: data.get('householdName'), address: data.get('address'),
    timezone: data.get('timezone'),
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
  if (!await confirmDialog('Remove roommate?', `${el.dataset.name} will lose access to this household. Their unfinished chores and future hosted events will be removed, and their announcements archived. Balances involving them will leave the active view; past transactions will remain in history.`, 'Remove')) return;
  await api(`/households/${S.hid}/members/${el.dataset.id}`, { method: 'DELETE' });
  toast('Roommate removed');
  window.dispatchEvent(new Event('roomie:render'));
};
actions['leave-household'] = async () => {
  if (!await confirmDialog('Leave household?', 'Your unfinished chores and future hosted events will be removed, and your announcements archived. Balances involving you will leave the active view; past transactions remain in history. Your account and other households will stay.', 'Leave household')) return;
  await api(`/households/${S.hid}/members/${S.user.userId}`, { method: 'DELETE' });
  const me = await api('/me'); S.households = me.households;
  S.hid = S.households[0]?.householdId ?? null;
  S.navCounts = { overdue: 0, at: 0, hid: null };
  if (S.hid) localStorage.setItem('roomie.hid', String(S.hid)); else localStorage.removeItem('roomie.hid');
  toast('You left the household'); window.dispatchEvent(new Event('roomie:render'));
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
  if (m.leftDate) { toast('This roommate is no longer in the household.'); return; }
  const methods = [...(m.paymentMethods ?? [])].sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred));
  const contact = [
    m.phoneNumber ? `<div class="contact-list-row"><dt>Phone</dt><dd><a href="tel:${encodeURIComponent(m.phoneNumber)}">${esc(m.phoneNumber)}</a></dd></div>` : '',
    m.email ? `<div class="contact-list-row"><dt>Email</dt><dd><a href="mailto:${encodeURIComponent(m.email)}">${esc(m.email)}</a></dd></div>` : '',
  ].join('');
  const payments = methods.length ? `<section class="profile-section"><h3>Payment preferences</h3><dl class="contact-list">${methods.map(method => `<div class="contact-list-row"><dt>${esc(PAYMENT_APPS[method.app] ?? method.app)} ${method.isPreferred ? badge('Preferred', 'gray') : ''}</dt><dd>${esc(method.username)}</dd></div>`).join('')}</dl></section>` : '';
  const management = household()?.role === 'owner' && m.userId !== S.user.userId ? `<details class="profile-management"><summary>Manage roommate</summary><div class="acts"><button class="btn s" data-action="transfer-owner" data-id="${m.userId}" data-name="${esc(fullName(m))}">Transfer ownership</button>${m.role === 'member' ? `<button class="btn s d" data-action="remove-member" data-id="${m.userId}" data-name="${esc(fullName(m))}">Remove from household</button>` : ''}</div></details>` : '';
  openModal(`${mhead(esc(fullName(m)))}<div class="roommate-profile-list"><div class="roommate-profile-head">${avatar(m, 'lg')}<p class="mute">${m.role === 'owner' ? 'Household owner' : 'Household member'}</p></div>${contact ? `<dl class="contact-list">${contact}</dl>` : ''}${payments}${management}${m.userId === S.user.userId ? '<div class="acts"><button class="btn p" data-action="open-profile">Edit my profile</button></div>' : ''}</div>`);
}
actions['open-profile'] = () => { closeModal(); location.hash = '#/settings'; };

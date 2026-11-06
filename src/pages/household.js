import { actions } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, badge, closeModal, esc, fmtDate, fullName, ico, mhead, openModal, phead, toast } from '../lib/dom.js';

const PAYMENT_APPS = { venmo: 'Venmo', zelle: 'Zelle', apple_cash: 'Apple Cash' };
let members = [];

const memberRow = (m, h) => `<div class="item row click-row roommate-row" role="button" tabindex="0" data-action="roommate-profile" data-id="${m.userId}" aria-label="View ${esc(fullName(m))}'s profile">
  ${avatar(m)}<div class="grow"><b>${esc(fullName(m))}</b>${m.userId === S.user.userId ? ' <span class="mute">(you)</span>' : ''}
  <div class="mute" style="font-size:13px">${m.leftDate ? `Moved out ${fmtDate(m.leftDate, h.timezone)}` : `Joined ${fmtDate(m.joinedDate, h.timezone)}`}</div></div>
  ${badge(m.role === 'owner' ? 'Owner' : 'Member', m.leftDate ? 'gray' : '')}<span class="row-chevron">${ico('chevron', 16)}</span></div>`;

export async function householdView() {
  const h = household(), response = await api(`/households/${h.householdId}/members`);
  members = response.members;
  const current = members.filter((m) => !m.leftDate), former = members.filter((m) => m.leftDate);
  return `${phead('Household')}
    <div class="stack"><section class="card invite-card"><h2>${esc(h.householdName)}</h2>
      <p class="mute">${current.length} ${current.length === 1 ? 'member' : 'members'} · ${esc(h.timezone)}</p><hr class="hr">
      <h3>Roommates</h3>${current.map((m) => memberRow(m, h)).join('')}
      ${former.length ? `<details style="margin-top:16px"><summary>Former roommates (${former.length})</summary>${former.map((m) => memberRow(m, h)).join('')}</details>` : ''}
      <hr class="hr"><h3>Invite roommates</h3><p class="mute invite-description">Share this code. Anyone who signs up can join with it.</p>
      <div class="rowline"><span class="code">${esc(h.joinCode)}</span><button class="btn" data-action="copy-code" data-code="${esc(h.joinCode)}">Copy</button></div>
    </section></div>`;
}

actions['copy-code'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.code); toast('Join code copied'); } catch { toast(`Your code is ${el.dataset.code}`); } };
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

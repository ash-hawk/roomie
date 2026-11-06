import { scheduleToolbar } from '../components/schedule-toolbar.js';
// Slice (c): household events + sticky-note board. The server owns the rules (who may edit, who was
// asked about hosting, who gets notified); this page shows data and sends intent.
// Times are always shown in the household's timezone. The board and calendar poll every 15 seconds,
// so a roommate's note or answer shows up without a refresh.
import { actions, forms, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { ago as agoIn, avatar, closeModal, confirmDialog, empty, esc, fullName, ico, mhead, openModal, personColor, phead, showError, toast } from '../lib/dom.js';

import { boardIdentity } from '../components/board-profile.js';
import { approvalState } from '../../shared/event-approval.ts';

const CATS = [['meeting', 'Meeting'], ['hosting', 'Hosting guests'], ['other', 'Other']];

let view = 'list', sortBy = 'date', eventType = 'all';
let monthStart = null, prefsScope = null;
const prefsKey = () => `roomie.calendar.${S.user.userId}.${hid()}`;
function loadPrefs() {
  if (prefsScope === prefsKey()) return;
  prefsScope = prefsKey(); monthStart = null;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(prefsScope) || '{}') ?? {}; } catch { /* Defaults remain usable. */ }
  view = ['list', 'month'].includes(saved.view) ? saved.view : 'list';
  sortBy = ['date', 'color'].includes(saved.sortBy) ? saved.sortBy : 'date';
  eventType = ['all', ...CATS.map(([key]) => key)].includes(saved.eventType) ? saved.eventType : 'all';
}
let D = null;             // { members, events, notes }
let seen = '';            // what the last poll saw, to repaint only on change

const hid = () => household().householdId;
const tz = () => household().timezone;
const who = (id) => D.members.find((m) => m.userId === id);
const first = (id) => (id === S.user.userId ? 'You' : who(id)?.firstName ?? 'Someone');
const active = () => D.members.filter((m) => !m.leftDate);
const eventOf = (id) => D.events.find((e) => e.eventId === id);
const ymdIn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(d));
const hmIn = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const timeFmt = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' });
const dayLabel = (ymd) => {
  const today = ymdIn(Date.now());
  if (ymd === today) return 'Today';
  if (ymd === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
};
const whenFull = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: tz(), weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function addDays(ymd, n) { const t = new Date(`${ymd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const ago = (iso) => agoIn(iso, tz());
const takeHandoff = () => { try { const v = JSON.parse(sessionStorage.getItem('roomie.open') || 'null'); sessionStorage.removeItem('roomie.open'); return v; } catch { return null; } };
const refresh = () => window.dispatchEvent(new Event('roomie:render'));
const path = (p) => `/households/${hid()}${p}`;
const savePrefs = () => { try { localStorage.setItem(prefsKey(), JSON.stringify({ view, sortBy, eventType })); } catch { /* preferences are optional */ } };

// ---- data -------------------------------------------------------------------------------------
async function load() {
  const [{ members }, { events }, { notes }] = await Promise.all([api(path('/members')), api(path('/events')), api(path('/board'))]);
  D = { members, events, notes };
  seen = JSON.stringify([events, notes]);
}

// Events shown in the list and month views.
function items() {
  const out = [];
  for (const e of D.events) {
    if (eventType !== 'all' && e.category !== eventType) continue;
    out.push({ kind: 'event', at: e.eventDate, ymd: ymdIn(e.eventDate), color: personColor(e.createdByUserId), e });
  }
  return out.sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
}

// ---- rows -------------------------------------------------------------------------------------
function approvalChip(e) {
  const state = approvalState(e.tags);
  if (!state.total) return '';
  const kind = state.status === 'confirmed' ? 'paid' : state.status === 'changes_requested' ? 'disputed' : 'unpaid';
  return `<span class="st ${kind}">${state.label} · ${state.approved} of ${state.total} approved</span>`;
}
function hostChip(e) {
  return `<div class="event-status"><span class="st later">${esc(e.category === 'meeting' ? 'Meeting' : e.category === 'hosting' ? 'Hosting' : e.otherLabel || 'Other')}</span>${approvalChip(e)}</div>`;
}

function row(it) {
  const e = it.e;
  return `<div class="item click row ev" data-action="event-detail" data-id="${e.eventId}" tabindex="0" style="--ev:${esc(it.color)}">
    <span class="evbar"></span><div class="grow"><b>${esc(e.eventName)}</b>
    <div class="hint event-meta"><span>${timeFmt(e.eventDate)}${e.location ? ` · ${esc(e.location)}` : ''}</span>
    ${e.createdByUserId ? `<span class="event-creator">${avatar(who(e.createdByUserId), 'sm')} Added by ${esc(first(e.createdByUserId))}</span>` : ''}</div></div>${hostChip(e)}</div>`;
}

// ---- list view --------------------------------------------------------------------------------
function listView() {
  const today = ymdIn(Date.now());
  let list = items().filter((i) => i.ymd >= today && i.ymd.slice(0, 7) === monthStart.slice(0, 7));
  if (!list.length) return empty('📅', 'No matching events', 'No upcoming events match this month and event type.');
  if (sortBy === 'color') {
    list = [...list].sort((x, y) => (x.color === y.color ? Date.parse(x.at) - Date.parse(y.at) : x.color < y.color ? -1 : 1));
    return list.map((i) => `${row(i)}`).join('');
  }
  const days = [...new Set(list.map((i) => i.ymd))];
  return days.map((d) => `<div class="dayh">${dayLabel(d)}</div>${list.filter((i) => i.ymd === d).map(row).join('')}`).join('');
}

// ---- month view -------------------------------------------------------------------------------
function monthView() {
  const today = ymdIn(Date.now());
  monthStart ??= `${today.slice(0, 7)}-01`;
  const lead = new Date(`${monthStart}T12:00:00Z`).getUTCDay();
  const gridStart = addDays(monthStart, -lead);
  const all = items();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    if (i >= 35 && d.slice(0, 7) !== monthStart.slice(0, 7)) break;
    const todays = all.filter((x) => x.ymd === d);
    cells.push(`<button class="day2 ${d.slice(0, 7) !== monthStart.slice(0, 7) ? 'out' : ''} ${d === today ? 'today' : ''}" data-action="day-detail" data-day="${d}" aria-label="${esc(dayLabel(d))}, ${todays.length} items">
      <span class="dn">${Number(d.slice(8))}</span>${todays.slice(0, 3).map((x) => { const state = approvalState(x.e.tags); return `<i class="dpill ${state.total && state.status !== 'confirmed' ? 'pending-event' : ''}" style="background:${esc(x.color)}" title="${esc(x.e.eventName)}${state.total ? ` · ${state.label} · ${state.approved} of ${state.total} approved` : ''}">${esc(x.e.eventName)}${state.total && state.status !== 'confirmed' ? ` · ${state.label}` : ''}</i>`; }).join('')}${todays.length > 3 ? `<small>+${todays.length - 3} more</small>` : ''}</button>`);
  }
  return `<div class="mgrid mhead">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div><div class="mgrid">${cells.join('')}</div>`;
}
actions['month-nav'] = (el) => { const t = new Date(`${monthStart}T12:00:00Z`); t.setUTCMonth(t.getUTCMonth() + Number(el.dataset.n)); monthStart = t.toISOString().slice(0, 7) + '-01'; refreshSchedule(); };
actions['day-detail'] = (el) => {
  const d = el.dataset.day, todays = items().filter((x) => x.ymd === d);
  openModal(`${mhead(esc(dayLabel(d)))}<div class="stack">${todays.length ? todays.map(row).join('') : '<p class="mute">Nothing on this day.</p>'}</div>
    <div class="acts"><button class="btn p" data-action="add-event" data-day="${d}">Add event</button></div>`);
};

// ---- the page ---------------------------------------------------------------------------------
function scheduleContent() {
  const title = new Date(`${monthStart}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const filters = `<select class="input" data-input="cal-event-type" aria-label="Filter events by type"><option value="all">All event types</option>${CATS.map(([key, label]) => `<option value="${key}" ${eventType === key ? 'selected' : ''}>${label}</option>`).join('')}</select>${view === 'list' ? `<select class="input" data-input="cal-sort" aria-label="Sort by"><option value="date" ${sortBy === 'date' ? 'selected' : ''}>Sort: date</option><option value="color" ${sortBy === 'color' ? 'selected' : ''}>Sort: roommate</option></select>` : ''}`;
  return `${scheduleToolbar({ title, monthAction: 'month-nav', viewInput: 'cal-view', view, calendarValue: 'month', filters })}<div class="event-schedule-content">${view === 'list' ? listView() : monthView()}</div>`;
}
function refreshSchedule(focusInput) {
  const content = document.getElementById('cal-main');
  if (!content) return;
  const filterWasOpen = Boolean(content.querySelector('.schedule-filter-menu[open]'));
  content.innerHTML = scheduleContent();
  if (filterWasOpen && focusInput && !focusInput.endsWith('-view')) content.querySelector('.schedule-filter-menu').open = true;
  if (focusInput) content.querySelector(`[data-input="${focusInput}"]`)?.focus();
}
export async function calendarView() {
  loadPrefs();
  await load();
  monthStart ??= `${ymdIn(Date.now()).slice(0, 7)}-01`;
  const head = phead('Events', 'Meetings, hosting and other plans for your house.', `<button class="btn p" data-action="add-event">${ico('plus', 16)} Add event</button>`);
  const handoff = takeHandoff();
  if (handoff?.type === 'event') setTimeout(() => actions['event-detail']({ dataset: { id: String(handoff.id) } }), 60);
  return `${head}<div class="page-content split cal"><section class="card" id="cal-main">${scheduleContent()}</section><section class="card board" data-board>${boardInner()}</section></div>`;
}
inputs['cal-view'] = (el) => {
  if (!['list', 'month'].includes(el.value)) return;
  view = el.value; savePrefs(); refreshSchedule('cal-view');
};
inputs['cal-event-type'] = (el) => { eventType = el.value; savePrefs(); refreshSchedule('cal-event-type'); };
inputs['cal-sort'] = (el) => { sortBy = el.value; savePrefs(); refreshSchedule('cal-sort'); };

// ---- event detail -----------------------------------------------------------------------------
actions['event-detail'] = (el) => {
  const e = eventOf(Number(el.dataset.id)); if (!e) return;
  const mine = e.tags.find((t) => t.userId === S.user.userId);
  const answer = (t) => (t.response === 'accepted' ? '<span class="st paid">Approved</span>' : t.response === 'declined' ? '<span class="st disputed">Changes requested</span>' : t.response === 'pending' ? '<span class="st unpaid">Waiting</span>' : '');
  openModal(`${mhead(esc(e.eventName))}
    <div class="row" style="gap:8px;flex-wrap:wrap"><span class="evdot" style="background:${personColor(e.createdByUserId)}"></span><b>${whenFull(e.eventDate)}${e.endDate ? ` to ${timeFmt(e.endDate)}` : ''}</b></div>
    <div class="hint">${esc(e.category === 'other' ? e.otherLabel || 'Other' : CATS.find(([k]) => k === e.category)?.[1] ?? '')}${e.location ? ` · ${esc(e.location)}` : ''}${e.reminderMinutesBefore != null ? ` · reminder ${e.reminderMinutesBefore >= 60 && e.reminderMinutesBefore % 60 === 0 ? `${e.reminderMinutesBefore / 60}h` : `${e.reminderMinutesBefore}m`} before` : ''}</div>
    ${approvalChip(e)}
    ${e.description ? `<p>${esc(e.description)}</p>` : ''}
    <div class="hint">Added by ${esc(first(e.createdByUserId))}</div>
    ${e.tags.length ? `<div class="stack">${e.tags.map((t) => `<div class="item row">${avatar(who(t.userId))}<div class="grow"><b>${esc(first(t.userId))}</b></div>${answer(t)}</div>`).join('')}</div>` : ''}
    ${mine?.response ? mine.response === 'pending' ? `<p class="hint">${esc(first(e.createdByUserId))} is asking for your approval. The event stays pending until everyone selected approves it.</p><div class="acts" style="justify-content:flex-start"><button class="btn p" data-action="event-answer" data-id="${e.eventId}" data-response="accepted">Approve</button><button class="btn" data-action="event-answer" data-id="${e.eventId}" data-response="declined">Request changes</button></div>` : `<p class="hint">${mine.response === 'accepted' ? 'You approved this event.' : 'You requested changes to this event.'}</p><button class="btn" style="align-self:flex-start" data-action="event-edit-response" aria-expanded="false">Edit response</button><div class="acts" data-response-options hidden style="justify-content:flex-start"><button class="btn p" data-action="event-answer" data-id="${e.eventId}" data-response="accepted" ${mine.response === 'accepted' ? 'disabled' : ''}>${mine.response === 'accepted' ? 'Approved' : 'Approve'}</button><button class="btn" data-action="event-answer" data-id="${e.eventId}" data-response="declined" ${mine.response === 'declined' ? 'disabled' : ''}>${mine.response === 'declined' ? 'Changes requested' : 'Request changes'}</button></div>` : ''}
    ${e.canEdit ? `<div class="acts" style="justify-content:flex-start"><button class="btn" data-action="edit-event" data-id="${e.eventId}">Edit</button><button class="btn d" data-action="delete-event" data-id="${e.eventId}">Delete</button></div>` : ''}`);
};
actions['event-edit-response'] = (button) => {
  const options = button.closest('[role="dialog"]').querySelector('[data-response-options]');
  options.hidden = !options.hidden;
  button.setAttribute('aria-expanded', String(!options.hidden));
};
actions['event-answer'] = async (el) => { await api(path(`/events/${el.dataset.id}/respond`), { method: 'POST', body: { response: el.dataset.response } }); closeModal(); toast('Answer sent'); refresh(); };
actions['delete-event'] = async (el) => { if (!await confirmDialog('Delete event?', 'This removes the event for everyone in the household.')) return;
  await api(path(`/events/${el.dataset.id}`), { method: 'DELETE' }); closeModal(); toast('Event deleted'); refresh(); };

// ---- add / edit ---------------------------------------------------------------------------------
function eventForm(e, day, linkToNote = false) {
  const others = active().filter((m) => m.userId !== S.user.userId);
  const date = e ? ymdIn(e.eventDate) : day || ymdIn(Date.now());
  const endSame = e?.endDate && ymdIn(e.endDate) === date;
  const tagged = new Set(e?.tags.map((t) => t.userId) ?? []);
  return `${mhead(e ? 'Edit event' : 'Add an event')}
  <form class="stack" data-form="event-save" ${e ? `data-id="${e.eventId}"` : ''} ${linkToNote ? 'data-link-to-note="1"' : ''} autocomplete="off">
    <label class="fld"><span>What is happening?</span><input class="input" name="eventName" required maxlength="120" value="${esc(e?.eventName ?? '')}" placeholder="House meeting"></label>
    <label class="fld"><span>Date</span><input class="input" name="date" type="date" required value="${date}"></label>
    <div class="inline-grid event-time-range"><label class="fld"><span>Starts</span><input class="input" name="time" type="time" required value="${e ? hmIn(e.eventDate) : '18:00'}"></label>
      <label class="fld"><span>Ends (optional)</span><input class="input" name="endTime" type="time" value="${endSame ? hmIn(e.endDate) : ''}"></label></div>
    <label class="fld"><span>Where (optional)</span><input class="input" name="location" maxlength="120" value="${esc(e?.location ?? '')}" placeholder="Living room"></label>
    <div class="fld"><span>What kind?</span><div class="methods">${CATS.map(([k, l]) => `<label><input type="radio" name="category" value="${k}" ${(e?.category ?? 'meeting') === k ? 'checked' : ''} data-input="event-cat">${l}</label>`).join('')}</div></div>
    <label class="fld" id="other-label-field" ${e?.category === 'other' ? '' : 'hidden'}><span>Label for this event</span><input class="input" name="otherLabel" maxlength="40" value="${esc(e?.otherLabel ?? '')}" placeholder="Maintenance"><small class="hint">This label appears on the calendar card.</small></label>
    <label class="fld"><span>Reminder</span><select class="input" name="reminder">${[['', 'No reminder'], ['0', 'At the start'], ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']].map(([v, l]) => `<option value="${v}" ${String(e?.reminderMinutesBefore ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="fld"><span id="tag-label">Ask for approval</span><p class="hint" id="tag-hint">This event will appear on the calendar as Pending approval. Select the roommates who need to approve it before it’s confirmed. Leave everyone unchecked if no approval is needed.</p>${others.length ? `<label class="chk"><input type="checkbox" data-input="event-select-all" ${others.every((m) => tagged.has(m.userId)) ? 'checked' : ''}> Select all roommates</label>` : ''}<div class="opt-list">${others.length ? others.map((m) => `<label class="chk"><input type="checkbox" name="tag" data-input="event-approver" value="${m.userId}" ${tagged.has(m.userId) ? 'checked' : ''}> ${avatar(m, 'sm')} ${esc(fullName(m))}</label>`).join('') : '<span class="hint">No other roommates yet.</span>'}</div>
      </div>
    <label class="fld"><span>Details (optional)</span><textarea class="input" name="description" rows="2" maxlength="500">${esc(e?.description ?? '')}</textarea></label>
    <div class="err" role="alert"></div>
    <div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit">${e ? 'Save' : 'Add event'}</button></div>
  </form>`;
}
inputs['event-cat'] = () => {
  const f = document.querySelector('form[data-form=event-save]'); if (!f) return;
  const otherField = document.getElementById('other-label-field'), otherInput = f.elements.otherLabel;
  if (otherField && otherInput) { const isOther = f.elements.namedItem('category').value === 'other'; otherField.hidden = !isOther; otherInput.required = isOther; otherInput.disabled = !isOther; }
  syncSelectAll();
};
function syncSelectAll() {
  const form = document.querySelector('form[data-form=event-save]');
  const all = form?.querySelector('[data-input=event-select-all]');
  if (!all) return;
  const boxes = [...form.querySelectorAll('input[name=tag]')];
  all.checked = boxes.every((box) => box.checked);
  all.indeterminate = boxes.some((box) => box.checked) && !all.checked;
}
inputs['event-select-all'] = (el) => { el.form.querySelectorAll('input[name=tag]').forEach((box) => { box.checked = el.checked; }); syncSelectAll(); };
inputs['event-approver'] = syncSelectAll;
actions['add-event'] = (el) => { openModal(eventForm(null, el?.dataset?.day)); inputs['event-cat'](); };
actions['add-and-link-event'] = () => { openModal(eventForm(null, null, true)); inputs['event-cat'](); };
actions['edit-event'] = (el) => { const e = eventOf(Number(el.dataset.id)); if (!e) return; openModal(eventForm(e)); inputs['event-cat'](); };
forms['event-save'] = async (form) => {
  const f = new FormData(form), id = form.dataset.id;
  const body = { eventName: f.get('eventName'), date: f.get('date'), time: f.get('time'), endTime: f.get('endTime') || null, location: f.get('location'), category: f.get('category'),
    otherLabel: f.get('otherLabel'), reminderMinutesBefore: f.get('reminder') === '' ? null : Number(f.get('reminder')), description: f.get('description'), taggedUserIds: f.getAll('tag').map(Number) };
  let saved;
  try { saved = await api(path(id ? `/events/${id}` : '/events'), { method: id ? 'PATCH' : 'POST', body }); } catch (err) { return showError(form, err.message); }
  if (form.dataset.linkToNote === '1') {
    D.events.push(saved);
    const noteForm = document.querySelector('form[data-form="note-new"]');
    const mode = noteForm?.querySelector('[data-input="board-link-mode"]');
    const picker = noteForm?.querySelector('[name="eventId"]');
    if (mode && picker) {
      picker.insertAdjacentHTML('beforeend', `<option value="${saved.eventId}">${esc(saved.eventName)}</option>`);
      mode.value = 'link'; picker.hidden = false; picker.required = true; picker.value = String(saved.eventId);
    }
    seen = JSON.stringify([D.events, D.notes]);
    closeModal(); toast('Event added and linked'); return;
  }
  closeModal(); toast(id ? 'Event saved' : 'Event added'); refresh();
};

// ---- the board ----------------------------------------------------------------------------------
function noteHtml(n) {
  const ev = n.eventId ? eventOf(n.eventId) : null;
  return `<article data-board-message-ids="${[n.messageId, ...n.replies.map((r) => r.messageId)].join(' ')}" class="sticky ${n.isPinned ? 'pinned' : ''}">
    <div class="row t" style="gap:8px">${boardIdentity(who(n.senderUserId), first(n.senderUserId))}<div class="grow"> <span class="hint">${ago(n.postedDate)}</span></div>

      ${n.canEdit ? `<button class="x" data-action="note-pin" data-id="${n.messageId}" data-pinned="${n.isPinned ? '' : '1'}" aria-label="${n.isPinned ? 'Unpin' : 'Pin'}" title="${n.isPinned ? 'Unpin' : 'Pin'}">📌</button><button class="x" data-action="note-delete" data-id="${n.messageId}" aria-label="Delete note">✕</button>` : (n.isPinned ? '<span title="Pinned">📌</span>' : '')}</div>
    ${n.isPinned ? '<div class="pin-mark"><span aria-hidden="true">📌</span> Pinned</div>' : ''}
    <p>${esc(n.messageText)}</p>
    ${ev ? `<button class="chip" data-action="event-detail" data-id="${ev.eventId}">${ico('calendar', 13)} ${esc(ev.eventName)}</button>` : ''}
    ${n.replies.map((r) => `<div class="reply row t" style="gap:8px">${boardIdentity(who(r.senderUserId), null)}<div class="grow">${boardIdentity(who(r.senderUserId), first(r.senderUserId), false)} <span class="hint">${ago(r.postedDate)}</span><div>${esc(r.messageText)}</div></div>
      ${r.canEdit ? `<button class="x" data-action="note-delete" data-id="${r.messageId}" aria-label="Delete reply">✕</button>` : ''}</div>`).join('')}
    <form class="row replyf" data-form="note-reply" data-id="${n.messageId}"><input class="input" name="messageText" maxlength="500" placeholder="Reply" aria-label="Reply" required><button class="btn s" type="submit">Send</button></form></article>`;
}
function boardInner() {
  const upcoming = D.events.filter((e) => Date.parse(e.eventDate) > Date.now() - 86400000);
  return `<div class="row board-heading"><h2>Board</h2></div>
    <form class="stack" data-form="note-new"><textarea class="input" name="messageText" rows="2" maxlength="500" placeholder="Share a plan or check with everyone before hosting" aria-label="New note" required></textarea>
      <div class="row" style="gap:8px;flex-wrap:wrap"><select class="input" data-input="board-link-mode" aria-label="Event link option" style="flex:1;min-width:0"><option value="none">No linked event</option><option value="link">Link event</option><option value="add">Add and link event</option></select>
      <select class="input" name="eventId" aria-label="Choose an event" style="flex:1;min-width:0" hidden><option value="">Choose an event</option>${upcoming.map((e) => `<option value="${e.eventId}">${esc(e.eventName)}</option>`).join('')}</select>
      <button class="btn s" type="submit">Post</button></div><div class="err" role="alert"></div></form>
    <div class="notes">${D.notes.length ? D.notes.map(noteHtml).join('') : '<p class="board-empty">No notes yet — share a plan or check with everyone before hosting.</p>'}</div>`;
}
inputs['board-link-mode'] = (el) => {
  const picker = el.form?.querySelector('[name="eventId"]'); if (!picker) return;
  if (el.value === 'add') { el.value = 'none'; picker.hidden = true; picker.required = false; picker.value = ''; actions['add-and-link-event'](); return; }
  picker.hidden = el.value !== 'link';
  picker.required = !picker.hidden;
  if (picker.hidden) picker.value = '';
};
const paintBoard = () => document.querySelectorAll('[data-board]').forEach((el) => { el.innerHTML = boardInner(); });
async function reloadBoard() { const [{ notes }, { events }] = await Promise.all([api(path('/board')), api(path('/events'))]); D.notes = notes; D.events = events; paintBoard(); }
forms['note-new'] = async (form) => {
  const f = new FormData(form), body = { messageText: f.get('messageText') }; if (f.get('eventId')) body.eventId = Number(f.get('eventId'));
  try { await api(path('/board'), { method: 'POST', body }); } catch (err) { return showError(form, err.message); }
  await reloadBoard();
};
forms['note-reply'] = async (form) => {
  try { await api(path('/board'), { method: 'POST', body: { messageText: new FormData(form).get('messageText'), parentMessageId: Number(form.dataset.id) } }); } catch (err) { toast(err.message); return; }
  await reloadBoard();
};
actions['note-pin'] = async (el) => { await api(path(`/board/${el.dataset.id}`), { method: 'PATCH', body: { isPinned: el.dataset.pinned === '1' } }); await reloadBoard(); };
actions['note-delete'] = async (el) => { if (!await confirmDialog('Delete this note?', 'Replies to this note will also be removed.')) return;
  await api(path(`/board/${el.dataset.id}`), { method: 'DELETE' }); await reloadBoard(); };

// ---- near-real-time: poll while the calendar is on screen and nobody is typing -------------------
setInterval(async () => {
  try {
    if (document.hidden || document.getElementById('root')?.dataset.page !== 'calendar' || document.getElementById('modal') || !D) return;
    if (document.activeElement?.closest?.('form,textarea,input,select') || document.querySelector('.schedule-filter-menu[open]')) return;
    const [{ events }, { notes }] = await Promise.all([api(path('/events')), api(path('/board'))]);
    if (JSON.stringify([events, notes]) !== seen) refresh();
  } catch { /* offline or signed out: try again next tick */ }
}, 15000);

// Home shows one household schedule in two formats; feature pages own editing and responses.
import { actions, forms, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, closeModal, esc, mhead, money, openModal, personColor, phead, showError, toast } from '../lib/dom.js';
import { addDays } from '../../shared/chore-dates.ts';
import { monthDays, scheduleItems } from '../../shared/home-schedule.ts';
import { householdBoard, announcementForm } from '../components/household-board.js';
import { toCents } from '../../shared/money.ts';

const hid = () => household().householdId;
const tz = () => household().timezone;
const ymdIn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(d));
const timeFmt = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' });
const dayLabel = (day) => day === ymdIn(Date.now()) ? 'Today' : day === addDays(ymdIn(Date.now()), 1) ? 'Tomorrow'
  : new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
// Only the display format is remembered. Old card-order and visibility preferences are ignored.
const viewKey = () => `roomie.home.view.${S.user.userId}.${hid()}`;
const getView = () => { try { return localStorage.getItem(viewKey()) === 'calendar' ? 'calendar' : 'list'; } catch { return 'list'; } };
let monthStart = null, monthHousehold = null, D = null;

function row(item) {
  const member = D.members.find((m) => m.userId === item.userId);
  const name = item.userId === S.user.userId ? 'You' : member?.firstName || 'Someone';
  const overdue = item.kind === 'chore' && !item.completed && Date.parse(item.at) < Date.now();
  return `<a class="item click row ev home-schedule-row ${item.completed ? 'completed' : ''} ${item.approval?.status ?? ''}" href="#/${item.kind === 'event' ? 'calendar' : 'chores'}" data-action="home-open" data-kind="${item.kind}" data-id="${item.eventId ?? ''}" style="--ev:${personColor(item.userId)}">
    <span class="evbar"></span><div class="grow"><div class="home-item-heading"><span class="home-kind">${esc(item.label)}</span>${item.approval?.total ? `<span class="st ${item.approval.status === 'confirmed' ? 'paid' : item.approval.status === 'changes_requested' ? 'disputed' : 'unpaid'}">${item.approval.label} · ${item.approval.approved} of ${item.approval.total} approved</span>` : ''}${item.completed ? '<span class="st paid">Completed</span>' : overdue ? '<span class="st overdue">Overdue</span>' : ''}</div><b>${esc(item.name)}</b>
    <div class="hint">${timeFmt(item.at)} · ${item.kind === 'event' ? 'Added by ' : ''}${esc(name)}${item.location ? ` · ${esc(item.location)}` : ''}</div></div>${avatar(member, 'sm')}</a>`;
}

function monthNav(view) {
  const title = new Date(`${monthStart}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return `<div class="home-schedule-toolbar"><div class="month-nav"><button class="btn s" data-action="home-month" data-n="-1" aria-label="Previous month">‹</button><div class="row"><h2>${title}</h2></div><button class="btn s" data-action="home-month" data-n="1" aria-label="Next month">›</button></div><select class="input home-view-select" data-input="home-view" aria-label="Schedule view">${[['calendar', 'Calendar view'], ['list', 'List view']].map(([key, label]) => `<option value="${key}" ${view === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
}

function listView() {
  const items = D.items.filter((item) => item.ymd.slice(0, 7) === monthStart.slice(0, 7));
  return `${monthNav('list')}${items.length ? [...new Set(items.map((item) => item.ymd))].map((day) => `<section class="stack home-day"><h3>${esc(dayLabel(day))}</h3>${items.filter((item) => item.ymd === day).map(row).join('')}</section>`).join('')
    : '<p class="home-empty">No events or chores this month.</p>'}`;
}

function calendarView() {
  const today = ymdIn(Date.now());
  return `${monthNav('calendar')}
    <div class="mgrid mhead">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="mgrid home-month">${monthDays(monthStart).map((day) => {
      const items = D.items.filter((item) => item.ymd === day);
      return `<button class="day2 ${day.slice(0, 7) !== monthStart.slice(0, 7) ? 'out' : ''} ${day === today ? 'today' : ''}" data-action="home-day" data-day="${day}" aria-label="${esc(dayLabel(day))}, ${items.length} items" ${day === today ? 'aria-current="date"' : ''}>
        <span class="dn">${Number(day.slice(8))}</span>${items.slice(0, 3).map((item) => `<span class="home-calendar-item ${item.completed ? 'completed' : ''}" style="--ev:${personColor(item.userId)}"><span>${timeFmt(item.at)} · ${esc(item.label)}</span><b>${esc(item.name)}</b>${item.approval?.total ? `<span class="home-calendar-approval">${item.approval.label} · ${item.approval.approved}/${item.approval.total}</span>` : ''}</span>`).join('')}
        ${items.length > 3 ? `<span class="home-more">+${items.length - 3} more</span>` : ''}<span class="home-mobile-count" aria-hidden="true">${items.length || ''}</span></button>`;
    }).join('')}</div>`;
}

export async function homeView() {
  const [{ members }, { events }, chores, balances, { notes }] = await Promise.all([
    api(`/households/${hid()}/members`), api(`/households/${hid()}/events`), api(`/households/${hid()}/chores`), api(`/households/${hid()}/balances`), api(`/households/${hid()}/board`),
  ]);
  D = { householdId: hid(), members, events, chores, notes, user: S.user, timezone: tz(), items: scheduleItems(events, chores, tz()) };
  if (monthHousehold !== hid()) { monthStart = null; monthHousehold = hid(); }
  monthStart ??= `${ymdIn(Date.now()).slice(0, 7)}-01`;
  const view = getView();
  const owed = balances.mine.reduce((sum, b) => sum + Math.max(0, -toCents(b.signedAmount)), 0);
  const owingMe = balances.mine.reduce((sum, b) => sum + Math.max(0, toCents(b.signedAmount)), 0);
  return `${phead(esc(household().householdName), 'Shared household schedule', 'See an overview of what’s happening in your household.')}
    <div class="page-content stack"><section class="card stack home-board" id="home-board">${householdBoard(D)}</section><section class="card stack home-schedule" aria-label="Shared household schedule">
    <div class="${view === 'list' ? 'stack' : ''}" id="home-schedule-content" data-view="${view}">${view === 'calendar' ? calendarView() : listView()}</div></section>
    <section class="card home-finances"><div><h2>Finances</h2><p class="hint">Your shared expense overview</p></div><div class="home-balance"><span>You owe <b>${money(owed)}</b></span><span>Owed to you <b>${money(owingMe)}</b></span></div><a class="btn s" href="#/finances">Open finances</a></section></div>`;
}

inputs['home-view'] = (el) => {
  const view = el.value;
  if (!['calendar', 'list'].includes(view)) return;
  try { localStorage.setItem(viewKey(), view); } catch { /* Display still changes when storage is unavailable. */ }
  // Use the same loaded items and keep keyboard focus on the view dropdown.
  const content = document.getElementById('home-schedule-content');
  content.dataset.view = view;
  content.className = view === 'list' ? 'stack' : '';
  const keepFocus = document.activeElement === el;
  content.innerHTML = view === 'calendar' ? calendarView() : listView();
  if (keepFocus) content.querySelector('[data-input=home-view]')?.focus();
};
actions['home-month'] = (el) => {
  const d = new Date(`${monthStart}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + Number(el.dataset.n)); monthStart = `${d.toISOString().slice(0, 7)}-01`;
  const content = document.getElementById('home-schedule-content');
  content.innerHTML = content.dataset.view === 'calendar' ? calendarView() : listView();
};
actions['home-day'] = (el) => {
  const items = D.items.filter((item) => item.ymd === el.dataset.day);
  openModal(`${mhead(esc(dayLabel(el.dataset.day)))}<div class="stack">${items.length ? items.map(row).join('') : '<p class="mute">No events or chores on this day.</p>'}</div>`);
};
actions['home-open'] = (el) => {
  closeModal();
  if (el.dataset.kind === 'event') {
    try { sessionStorage.setItem('roomie.open', JSON.stringify({ type: 'event', id: Number(el.dataset.id) })); } catch { /* The Events page still opens. */ }
  }
  location.hash = el.getAttribute('href');
};

async function refreshHomeBoard(onlyChanged = false) {
  const householdId = D.householdId;
  const [{ events }, chores, { notes }] = await Promise.all([api(`/households/${householdId}/events`), api(`/households/${householdId}/chores`), api(`/households/${householdId}/board`)]);
  if (hid() !== householdId || !document.getElementById('home-board')) return;
  if (onlyChanged && JSON.stringify([events, chores, notes]) === JSON.stringify([D.events, D.chores, D.notes])) return;
  const drafts = [...document.querySelectorAll('#home-board form')].map((form) => ({ kind: form.dataset.form, id: form.dataset.id, message: form.elements.namedItem('messageText')?.value ?? '', eventId: form.elements.namedItem('eventId')?.value ?? '' }));
  D = { ...D, events, chores, notes, items: scheduleItems(events, chores, tz()) };
  document.getElementById('home-board').innerHTML = householdBoard(D);
  for (const form of document.querySelectorAll('#home-board form')) {
    const draft = drafts.find((d) => d.kind === form.dataset.form && d.id === form.dataset.id);
    if (!draft) continue;
    form.elements.namedItem('messageText').value = draft.message;
    const eventField = form.elements.namedItem('eventId'); if (eventField) eventField.value = draft.eventId;
  }
  const content = document.getElementById('home-schedule-content');
  if (content) content.innerHTML = content.dataset.view === 'calendar' ? calendarView() : listView();
}
actions['home-board-response'] = async (button) => {
  const card = button.closest('article');
  card.setAttribute('aria-busy', 'true');
  const buttons = [...card.querySelectorAll('button')];
  buttons.forEach((el) => { el.disabled = true; });
  showError(card, '');
  const kind = button.dataset.kind, id = Number(button.dataset.id), answer = button.dataset.response;
  try {
    if (kind === 'event') await api(`/households/${D.householdId}/events/${id}/respond`, { method: 'POST', body: { response: answer } });
    else await api(`/households/${D.householdId}/swap-requests/${id}`, { method: 'PATCH', body: { action: answer } });
  } catch (error) { showError(card, error.message); return; }
  finally { card.removeAttribute('aria-busy'); buttons.forEach((el) => { el.disabled = false; }); }
  toast(answer === 'withdraw' ? 'Request cancelled' : 'Response saved');
  try { await refreshHomeBoard(); } catch { card.innerHTML = '<p class="hint" role="status">Response saved. Refresh Home to see the latest requests.</p>'; }
};
actions['home-make-announcement'] = () => openModal(`${mhead('Make announcement')}${announcementForm(D.events)}`);
const postHomeNote = async (form, reply) => {
  const data = new FormData(form), body = { messageText: data.get('messageText') };
  if (reply) body.parentMessageId = Number(form.dataset.id);
  else if (data.get('eventId')) body.eventId = Number(data.get('eventId'));
  try { await api(`/households/${D.householdId}/board`, { method: 'POST', body }); }
  catch (error) { showError(form, error.message); return; }
  form.reset(); if (!reply) closeModal(); toast(reply ? 'Reply posted' : 'Announcement posted');
  try { await refreshHomeBoard(); } catch { if (form.isConnected) showError(form, 'Posted successfully. Refresh Home to see the latest announcements.'); else toast('Posted successfully. Refresh Home to see the latest announcements.'); }
};
forms['home-note-new'] = (form) => postHomeNote(form, false);
forms['home-note-reply'] = (form) => postHomeNote(form, true);

// Like the Events board, refresh while idle; never interrupt editing or an in-flight response.
setInterval(async () => {
  if (document.hidden || document.getElementById('root')?.dataset.page !== 'home' || !D || document.getElementById('modal')) return;
  if (document.activeElement?.closest?.('form,input,textarea,select,button') || document.querySelector('#home-board [aria-busy=true]')) return;
  try { await refreshHomeBoard(true); } catch { /* Keep the last snapshot while offline. */ }
}, 15000);

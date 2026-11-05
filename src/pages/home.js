// Home shows one household schedule in two formats; feature pages own editing and responses.
import { actions, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, closeModal, esc, mhead, money, openModal, personColor, phead } from '../lib/dom.js';
import { addDays } from '../../shared/chore-dates.ts';
import { monthDays, scheduleItems } from '../../shared/home-schedule.ts';
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

function listView() {
  const today = ymdIn(Date.now());
  const upcoming = D.items.filter((item) => item.ymd >= today);
  const overdue = D.items.filter((item) => item.kind === 'chore' && !item.completed && item.ymd < today);
  return `${overdue.length ? `<section class="stack home-day"><h3>Overdue chores</h3>${overdue.map((item) => `<div><div class="hint">${esc(dayLabel(item.ymd))}</div>${row(item)}</div>`).join('')}</section>` : ''}
    ${upcoming.length ? [...new Set(upcoming.map((item) => item.ymd))].map((day) => `<section class="stack home-day"><h3>${esc(dayLabel(day))}</h3>${upcoming.filter((item) => item.ymd === day).map(row).join('')}</section>`).join('')
      : '<p class="home-empty">No upcoming events or chores. Your household schedule will appear here.</p>'}`;
}

function calendarView() {
  const today = ymdIn(Date.now());
  const title = new Date(`${monthStart}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return `<div class="month-nav"><button class="btn s" data-action="home-month" data-n="-1" aria-label="Previous month">‹</button><div class="row"><h2>${title}</h2></div><button class="btn s" data-action="home-month" data-n="1" aria-label="Next month">›</button></div>
    <div class="mgrid mhead">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="mgrid home-month">${monthDays(monthStart).map((day) => {
      const items = D.items.filter((item) => item.ymd === day);
      return `<button class="day2 ${day.slice(0, 7) !== monthStart.slice(0, 7) ? 'out' : ''} ${day === today ? 'today' : ''}" data-action="home-day" data-day="${day}" aria-label="${esc(dayLabel(day))}, ${items.length} items" ${day === today ? 'aria-current="date"' : ''}>
        <span class="dn">${Number(day.slice(8))}</span>${items.slice(0, 3).map((item) => `<span class="home-calendar-item ${item.completed ? 'completed' : ''}" style="--ev:${personColor(item.userId)}"><span>${timeFmt(item.at)} · ${esc(item.label)}</span><b>${esc(item.name)}</b>${item.approval?.total ? `<span class="home-calendar-approval">${item.approval.label} · ${item.approval.approved}/${item.approval.total}</span>` : ''}</span>`).join('')}
        ${items.length > 3 ? `<span class="home-more">+${items.length - 3} more</span>` : ''}<span class="home-mobile-count" aria-hidden="true">${items.length || ''}</span></button>`;
    }).join('')}</div>`;
}

export async function homeView() {
  const [{ members }, { events }, chores, balances] = await Promise.all([
    api(`/households/${hid()}/members`), api(`/households/${hid()}/events`), api(`/households/${hid()}/chores`), api(`/households/${hid()}/balances`),
  ]);
  D = { members, items: scheduleItems(events, chores, tz()) };
  if (monthHousehold !== hid()) { monthStart = null; monthHousehold = hid(); }
  monthStart ??= `${ymdIn(Date.now()).slice(0, 7)}-01`;
  const view = getView();
  const owed = balances.mine.reduce((sum, b) => sum + Math.max(0, -toCents(b.signedAmount)), 0);
  const owingMe = balances.mine.reduce((sum, b) => sum + Math.max(0, toCents(b.signedAmount)), 0);
  const viewSelect = `<select class="input home-view-select" data-input="home-view" aria-label="Schedule view">${[['calendar', 'Calendar view'], ['list', 'List view']].map(([key, label]) => `<option value="${key}" ${view === key ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  return `${phead(esc(household().householdName), 'Shared household schedule', 'See an overview of what’s happening in your household.', viewSelect)}
    <div class="page-content stack"><section class="card stack home-schedule" aria-label="Shared household schedule">
    <div class="${view === 'list' ? 'stack' : ''}" id="home-schedule-content">${view === 'calendar' ? calendarView() : listView()}</div></section>
    <section class="card home-finances"><div><h2>Finances</h2><p class="hint">Your shared expense overview</p></div><div class="home-balance"><span>You owe <b>${money(owed)}</b></span><span>Owed to you <b>${money(owingMe)}</b></span></div><a class="btn s" href="#/finances">Open finances</a></section></div>`;
}

inputs['home-view'] = (el) => {
  const view = el.value;
  if (!['calendar', 'list'].includes(view)) return;
  try { localStorage.setItem(viewKey(), view); } catch { /* Display still changes when storage is unavailable. */ }
  // Use the same loaded items and keep keyboard focus on the view dropdown.
  const content = document.getElementById('home-schedule-content');
  content.className = view === 'list' ? 'stack' : '';
  content.innerHTML = view === 'calendar' ? calendarView() : listView();
};
actions['home-month'] = (el) => {
  const d = new Date(`${monthStart}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + Number(el.dataset.n)); monthStart = `${d.toISOString().slice(0, 7)}-01`;
  document.getElementById('home-schedule-content').innerHTML = calendarView();
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

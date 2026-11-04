// Home combines household activity in a shared list or calendar.
// It composes existing endpoints; setup progress is derived from data Roomie already stores.
import { actions, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { esc, money, seg } from '../lib/dom.js';
import { greeting } from '../../shared/home.ts';
import { toCents } from '../../shared/money.ts';

const hid = () => household().householdId;
const tz = () => household().timezone;
const ymdIn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(d));
const hourIn = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', hour12: false }).format(new Date())) % 24;
const timeFmt = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' });
const dayLabel = (ymd) => {
  const today = ymdIn(Date.now());
  const t = (n) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  return ymd === today ? 'Today' : ymd === t(1) ? 'Tomorrow' : new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
};

let view = 'list';
let days = 7;
let offset = 0;
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateText = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' });
const refresh = () => window.dispatchEvent(new Event('roomie:render'));

function activityRows(items) {
  return items.map((x) => `<a class="home-activity" href="${x.href}" ${x.eventId ? `data-action="home-event" data-id="${x.eventId}"` : ''}>
    <span class="home-kind">${x.kind}</span><span class="home-time">${esc(x.time)}</span>
    <b>${esc(x.title)}</b><span class="home-person">${esc(x.person)}</span><span aria-hidden="true">›</span></a>`).join('');
}
function activityList(items, start, end) {
  const visible = items.filter((x) => (x.ymd >= start && x.ymd <= end) || (offset === 0 && x.overdue && x.ymd < start));
  if (!visible.length) return '<p class="home-empty">Nothing scheduled for these dates.</p>';
  const groups = [...new Set(visible.map((x) => x.ymd))];
  return groups.map((d) => `<section class="home-day"><h2>${d < start ? 'Overdue · ' + esc(dateText(d)) : esc(dayLabel(d)) + (['Today', 'Tomorrow'].includes(dayLabel(d)) ? ' · ' + esc(dateText(d)) : '')}</h2>${activityRows(visible.filter((x) => x.ymd === d))}</section>`).join('');
}
function activityCalendar(items, start) {
  return `<div class="home-calendar">${Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i), rows = items.filter((x) => x.ymd === d);
    return `<section class="home-calendar-day ${d === ymdIn(Date.now()) ? 'is-today' : ''}"><h2>${esc(dayLabel(d))}<small>${esc(dateText(d))}</small></h2>${rows.length ? activityRows(rows) : '<p class="hint">Nothing scheduled</p>'}</section>`;
  }).join('')}</div>`;
}

const prefKey = () => `roomie.home.${S.user.userId}.${hid()}`;
const getPrefs = () => { try { return { showSetup: true, setupCollapsed: false, ...JSON.parse(localStorage.getItem(prefKey()) || '{}') }; } catch { return { showSetup: true, setupCollapsed: false }; } };
const savePrefs = (prefs) => { try { localStorage.setItem(prefKey(), JSON.stringify(prefs)); } catch { /* personalization is optional */ } };

function setupCard(members, chores, prefs) {
  const steps = [
    { done: Boolean(household()), label: 'Join or create a household', href: '#/settings' },
    { done: Boolean(S.user.profilePhoto) && Boolean(S.user.paymentMethods?.length), label: 'Add a profile photo and payment app', href: '#/settings' },
    { done: members.filter((m) => !m.leftDate).length > 1, label: 'Invite your roommates', href: '#/household' },
    { done: chores.chores.length > 0, label: 'Add your first chore', href: '#/chores' },
  ];
  const complete = steps.filter((s) => s.done).length;
  if (complete === steps.length || !prefs.showSetup) return '';
  return `<section class="card setup-card ${prefs.setupCollapsed ? 'collapsed' : ''}"><div class="row sp"><div><div class="eyebrow">Get set up</div><h2>Make Roomie yours</h2></div><div class="row setup-actions"><b class="setup-progress">${complete} of ${steps.length}</b><button class="btn s" data-action="setup-collapse">${prefs.setupCollapsed ? 'Expand' : 'Collapse'}</button><button class="x" data-action="setup-dismiss" aria-label="Dismiss setup checklist">✕</button></div></div>
    <div class="setup-details"><div class="setup-track" aria-label="${complete} of ${steps.length} setup steps complete"><i style="--w:${complete / steps.length * 100}%"></i></div>
    <div class="setup-steps">${steps.map((s) => `<a class="setup-step ${s.done ? 'done' : ''}" href="${s.href}"><span aria-hidden="true">${s.done ? '✓' : '○'}</span><span>${esc(s.label)}</span></a>`).join('')}</div></div></section>`;
}

export async function homeView() {
  const [{ members }, { events }, chores, { expenses }, { notes }] = await Promise.all([
    api(`/households/${hid()}/members`), api(`/households/${hid()}/events`), api(`/households/${hid()}/chores`),
    api(`/households/${hid()}/expenses`), api(`/households/${hid()}/board`),
  ]);
  const name = (id) => members.find((m) => m.userId === id)?.firstName ?? 'Someone';
  const items = [
    ...events.map((e) => ({ kind: 'Event', at: e.eventDate, ymd: ymdIn(e.eventDate), time: timeFmt(e.eventDate), title: e.eventName, person: name(e.createdByUserId), href: '#/calendar', eventId: e.eventId })),
    ...chores.assignments.filter((a) => !a.isCompleted).map((a) => ({ a, c: chores.chores.find((c) => c.choreId === a.choreId) })).filter(({ c }) => c)
      .map(({ a, c }) => ({ kind: 'Chore', at: a.dueAt, ymd: ymdIn(a.dueAt), time: timeFmt(a.dueAt), title: c.choreName, person: name(a.assignedUserId), href: '#/chores', overdue: a.status === 'overdue' })),
    ...expenses.map((e) => ({ kind: 'Expense', at: `${e.purchaseDate}T00:00:00Z`, ymd: e.purchaseDate, time: 'Purchased', title: e.itemName, person: `${name(e.paidByUserId)} · ${money(toCents(e.totalAmount))}`, href: '#/finances' })),
    ...notes.map((n) => ({ kind: 'Board', at: n.postedDate, ymd: ymdIn(n.postedDate), time: timeFmt(n.postedDate), title: n.messageText, person: name(n.senderUserId), href: '#/calendar' })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const start = addDays(ymdIn(Date.now()), offset), end = addDays(start, days - 1);
  const range = offset === 0 ? '' : `<span class="hint">${esc(dateText(start))} – ${esc(dateText(end))}</span>`;
  return `<section class="card home-timeline" aria-label="Household activity">
    <header class="home-toolbar"><h1>${greeting(hourIn())}, ${esc(S.user.firstName || 'there')}</h1>
      <div class="home-controls">${seg([['list', 'List'], ['calendar', 'Calendar']], view, 'home-view')}
        <select class="input" data-input="home-range" aria-label="Date range"><option value="7" ${days === 7 ? 'selected' : ''}>Next 7 days</option><option value="14" ${days === 14 ? 'selected' : ''}>Next 14 days</option></select>
        <button class="btn s" data-action="home-previous" aria-label="Previous date range">‹</button><button class="btn s" data-action="home-today">Today</button><button class="btn s" data-action="home-next" aria-label="Next date range">›</button>
      </div></header>${range}
    ${view === 'list' ? activityList(items, start, end) : activityCalendar(items, start)}
  </section>${setupCard(members, chores, getPrefs())}`;
}
actions['home-view'] = (el) => { view = el.dataset.value; refresh(); };
inputs['home-range'] = (el) => { days = Number(el.value) === 14 ? 14 : 7; refresh(); };
actions['home-previous'] = () => { offset -= days; refresh(); };
actions['home-next'] = () => { offset += days; refresh(); };
actions['home-today'] = () => { offset = 0; refresh(); };

actions['home-event'] = (el) => { try { sessionStorage.setItem('roomie.open', JSON.stringify({ type: 'event', id: Number(el.dataset.id) })); } catch { /* the page still opens */ } location.hash = '#/calendar'; };
actions['setup-collapse'] = () => { const prefs = getPrefs(); prefs.setupCollapsed = !prefs.setupCollapsed; savePrefs(prefs); window.dispatchEvent(new Event('roomie:render')); };
actions['setup-dismiss'] = () => { const prefs = getPrefs(); prefs.showSetup = false; savePrefs(prefs); window.dispatchEvent(new Event('roomie:render')); };

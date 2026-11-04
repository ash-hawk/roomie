// Home is a dependable three-part snapshot plus a setup checklist for new households.
// It composes existing endpoints; setup progress is derived from data Roomie already stores.
import { actions, forms } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, closeModal, esc, ico, mhead, money, openModal, personColor, phead, toast } from '../lib/dom.js';
import { greeting, pickWeek } from '../../shared/home.ts';
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

function weekRows(events, chores, members) {
  const name = (id) => (id === S.user.userId ? 'You' : members.find((m) => m.userId === id)?.firstName ?? 'Someone');
  const all = [
    ...events.map((e) => ({ kind: 'event', at: e.eventDate, ymd: ymdIn(e.eventDate), e })),
    ...chores.assignments.filter((a) => !a.isCompleted).map((a) => ({ kind: 'chore', at: a.dueAt, ymd: ymdIn(a.dueAt), a, c: chores.chores.find((c) => c.choreId === a.choreId) })).filter((x) => x.c),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  const week = pickWeek(all, ymdIn(Date.now()), 7);
  const row = (x) => x.kind === 'event'
    ? `<a class="item click row ev" href="#/calendar" data-action="home-event" data-id="${x.e.eventId}" style="--ev:${personColor(x.e.createdByUserId)}"><span class="evbar"></span><div class="grow"><b>${esc(x.e.eventName)}</b><div class="hint">${timeFmt(x.e.eventDate)}${x.e.location ? ` · ${esc(x.e.location)}` : ''}</div></div></a>`
    : `<a class="item click row ev" href="#/chores" style="--ev:${personColor(x.a.assignedUserId)}"><span class="evbar"></span><div class="grow"><b>${ico('check', 14)} ${esc(x.c.choreName)}</b><div class="hint">${timeFmt(x.a.dueAt)} · ${esc(name(x.a.assignedUserId))}</div></div>${avatar(members.find((m) => m.userId === x.a.assignedUserId), 'sm')}</a>`;
  const days = [...new Set(week.map((x) => x.ymd))];
  return days.map((d) => `<div class="dayh">${dayLabel(d)}</div>${week.filter((x) => x.ymd === d).map(row).join('')}`).join('');
}

const cardHead = (title, href, label) => `<div class="row sp"><h2>${title}</h2><a class="btn s" href="${href}">${label}</a></div>`;
const compactEmpty = (text, href, action) => `<div class="compact-empty"><p>${text}</p><a class="btn s" href="${href}">${action}</a></div>`;
const prefKey = () => `roomie.home.${S.user.userId}.${hid()}`;
const getPrefs = () => { try { return { order: ['week', 'chores', 'finances'], showSetup: true, setupCollapsed: false, ...JSON.parse(localStorage.getItem(prefKey()) || '{}') }; } catch { return { order: ['week', 'chores', 'finances'], showSetup: true, setupCollapsed: false }; } };
const savePrefs = (prefs) => { try { localStorage.setItem(prefKey(), JSON.stringify(prefs)); } catch { /* personalization is optional */ } };

function setupCard(members, chores, prefs) {
  const steps = [
    { done: Boolean(household()), label: 'Join or create a household', href: '#/settings' },
    { done: Boolean(S.user.profilePhoto) && Boolean(S.user.paymentMethods?.length), label: 'Add a profile photo and payment app', href: '#/settings' },
    { done: members.filter((m) => !m.leftDate).length > 1, label: 'Invite your roommates', href: '#/settings' },
    { done: chores.chores.length > 0, label: 'Add your first chore', href: '#/chores' },
  ];
  const complete = steps.filter((s) => s.done).length;
  if (complete === steps.length || !prefs.showSetup) return '';
  return `<section class="card setup-card ${prefs.setupCollapsed ? 'collapsed' : ''}"><div class="row sp"><div><div class="eyebrow">Get set up</div><h2>Make Roomie yours</h2></div><div class="row setup-actions"><b class="setup-progress">${complete} of ${steps.length}</b><button class="btn s" data-action="setup-collapse">${prefs.setupCollapsed ? 'Expand' : 'Collapse'}</button><button class="x" data-action="setup-dismiss" aria-label="Dismiss setup checklist">✕</button></div></div>
    <div class="setup-details"><div class="setup-track" aria-label="${complete} of ${steps.length} setup steps complete"><i style="--w:${complete / steps.length * 100}%"></i></div>
    <div class="setup-steps">${steps.map((s) => `<a class="setup-step ${s.done ? 'done' : ''}" href="${s.href}"><span aria-hidden="true">${s.done ? '✓' : '○'}</span><span>${esc(s.label)}</span></a>`).join('')}</div></div></section>`;
}

export async function homeView() {
  const [{ members }, { events }, chores, balances] = await Promise.all([
    api(`/households/${hid()}/members`), api(`/households/${hid()}/events`), api(`/households/${hid()}/chores`), api(`/households/${hid()}/balances`),
  ]);
  const first = S.user.firstName || 'there';
  const dateLine = new Date().toLocaleDateString('en-US', { timeZone: tz(), weekday: 'long', month: 'long', day: 'numeric' });
  const week = weekRows(events, chores, members);
  const mine = chores.assignments.filter((a) => !a.isCompleted && a.assignedUserId === S.user.userId)
    .map((a) => ({ a, c: chores.chores.find((c) => c.choreId === a.choreId) })).filter((x) => x.c)
    .sort((x, y) => Date.parse(x.a.dueAt) - Date.parse(y.a.dueAt)).slice(0, 4);
  const owed = balances.mine.reduce((sum, b) => sum + Math.max(0, -toCents(b.signedAmount)), 0);
  const owingMe = balances.mine.reduce((sum, b) => sum + Math.max(0, toCents(b.signedAmount)), 0);
  const prefs = getPrefs();
  const cards = {
    week: `<section class="card stack">${cardHead('This week', '#/calendar', 'Open events')}${week || compactEmpty('No plans yet this week.', '#/calendar', 'Add an event')}</section>`,
    chores: `<section class="card stack">${cardHead('My chores', '#/chores', 'Open chores')}${mine.length ? mine.map(({ a, c }) => `<a class="item click row" href="#/chores"><div class="grow"><b>${esc(c.choreName)}</b><div class="hint">${dayLabel(ymdIn(a.dueAt))} · ${timeFmt(a.dueAt)}</div></div>${a.status === 'overdue' ? '<span class="st overdue">Overdue</span>' : ''}</a>`).join('') : compactEmpty('No chores assigned to you yet.', '#/chores', 'Add a chore')}</section>`,
    finances: `<section class="card stack">${cardHead('Finances', '#/finances', 'Open finances')}${owed || owingMe ? `<div class="finance-snapshot"><div><span>You owe</span><b>${money(owed)}</b></div><div><span>Owed to you</span><b>${money(owingMe)}</b></div></div>` : compactEmpty('No shared expenses yet.', '#/finances', 'Log an expense')}</section>`,
  };
  const order = prefs.order.filter((k) => cards[k]); for (const key of Object.keys(cards)) if (!order.includes(key)) order.push(key);

  return `${phead(esc(household().householdName), `${greeting(hourIn())}, ${esc(first)}`, dateLine, '<button class="btn s" data-action="customize-home">Customize</button>')}
    <div class="page-content stack">${setupCard(members, chores, prefs)}
      <div class="home-cards">${order.map((key) => cards[key]).join('')}</div>
    </div>`;
}

actions['home-event'] = (el) => { try { sessionStorage.setItem('roomie.open', JSON.stringify({ type: 'event', id: Number(el.dataset.id) })); } catch { /* the page still opens */ } location.hash = '#/calendar'; };
actions['setup-collapse'] = () => { const prefs = getPrefs(); prefs.setupCollapsed = !prefs.setupCollapsed; savePrefs(prefs); window.dispatchEvent(new Event('roomie:render')); };
actions['setup-dismiss'] = () => { const prefs = getPrefs(); prefs.showSetup = false; savePrefs(prefs); window.dispatchEvent(new Event('roomie:render')); };
actions['customize-home'] = () => {
  const prefs = getPrefs(), labels = { week: 'This week', chores: 'My chores', finances: 'Finances' };
  openModal(`${mhead('Customize Home')}<form class="stack" data-form="home-customize"><p class="hint">Choose the order of your snapshot cards.</p>
    ${[0, 1, 2].map((i) => `<label class="fld"><span>${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'} card</span><select class="input" name="card${i}">${Object.entries(labels).map(([k, label]) => `<option value="${k}" ${prefs.order[i] === k ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`).join('')}
    <label class="chk"><input type="checkbox" name="showSetup" ${prefs.showSetup ? 'checked' : ''}> Show the setup checklist until it is complete</label><div class="err" role="alert"></div>
    <div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit">Save</button></div></form>`);
};
forms['home-customize'] = (form) => {
  const data = new FormData(form), order = [0, 1, 2].map((i) => String(data.get(`card${i}`)));
  if (new Set(order).size !== 3) { form.querySelector('.err').textContent = 'Choose each card exactly once.'; return; }
  const prefs = getPrefs(); prefs.order = order; prefs.showSetup = data.get('showSetup') === 'on'; savePrefs(prefs); closeModal(); toast('Home updated'); window.dispatchEvent(new Event('roomie:render'));
};

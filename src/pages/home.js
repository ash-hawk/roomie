// Home is a dependable three-part snapshot plus a setup checklist for new households.
// It composes existing endpoints; setup progress is derived from data Roomie already stores.
import { actions } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, esc, ico, money, phead } from '../lib/dom.js';
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
    ? `<a class="item click row ev" href="#/calendar" data-action="home-event" data-id="${x.e.eventId}" style="--ev:${esc(x.e.color || '#4338ca')}"><span class="evbar"></span><div class="grow"><b>${esc(x.e.eventName)}</b><div class="hint">${timeFmt(x.e.eventDate)}${x.e.location ? ` · ${esc(x.e.location)}` : ''}</div></div></a>`
    : `<a class="item click row ev" href="#/chores" style="--ev:#64748b"><span class="evbar"></span><div class="grow"><b>${ico('check', 14)} ${esc(x.c.choreName)}</b><div class="hint">${timeFmt(x.a.dueAt)} · ${esc(name(x.a.assignedUserId))}</div></div>${avatar(members.find((m) => m.userId === x.a.assignedUserId), 'sm')}</a>`;
  const days = [...new Set(week.map((x) => x.ymd))];
  return days.map((d) => `<div class="dayh">${dayLabel(d)}</div>${week.filter((x) => x.ymd === d).map(row).join('')}`).join('');
}

const cardHead = (title, href, label) => `<div class="row sp"><h2>${title}</h2><a class="btn s" href="${href}">${label}</a></div>`;
const compactEmpty = (text, href, action) => `<div class="compact-empty"><p>${text}</p><a class="btn s" href="${href}">${action}</a></div>`;

function setupCard(members, chores) {
  const me = members.find((m) => m.userId === S.user.userId);
  const steps = [
    { done: Boolean(household()), label: 'Join or create a household', href: '#/settings' },
    { done: Boolean(S.user.profilePhoto) && Boolean(me?.paymentMethods?.length), label: 'Add a profile photo and payment app', href: '#/settings' },
    { done: members.filter((m) => !m.leftDate).length > 1, label: 'Invite your roommates', href: '#/settings' },
    { done: chores.chores.length > 0, label: 'Add your first chore', href: '#/chores' },
  ];
  const complete = steps.filter((s) => s.done).length;
  if (complete === steps.length) return '';
  return `<section class="card setup-card"><div class="row sp"><div><div class="eyebrow">Get set up</div><h2>Make Roomie yours</h2></div><b class="setup-progress">${complete} of ${steps.length}</b></div>
    <div class="setup-track" aria-label="${complete} of ${steps.length} setup steps complete"><i style="--w:${complete / steps.length * 100}%"></i></div>
    <div class="setup-steps">${steps.map((s) => `<a class="setup-step ${s.done ? 'done' : ''}" href="${s.href}"><span aria-hidden="true">${s.done ? '✓' : '○'}</span><span>${esc(s.label)}</span></a>`).join('')}</div></section>`;
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

  return `${phead(esc(household().householdName), `${greeting(hourIn())}, ${esc(first)}`, dateLine)}
    <div class="page-content stack">${setupCard(members, chores)}
      <div class="home-cards">
        <section class="card stack">${cardHead('This week', '#/calendar', 'Open calendar')}
          ${week || compactEmpty('No plans yet this week.', '#/calendar', 'Add an event')}</section>
        <section class="card stack">${cardHead('My chores', '#/chores', 'Open chores')}
          ${mine.length ? mine.map(({ a, c }) => `<a class="item click row" href="#/chores"><div class="grow"><b>${esc(c.choreName)}</b><div class="hint">${dayLabel(ymdIn(a.dueAt))} · ${timeFmt(a.dueAt)}</div></div>${a.status === 'overdue' ? '<span class="st overdue">Overdue</span>' : ''}</a>`).join('') : compactEmpty('No chores assigned to you yet.', '#/chores', 'Add a chore')}</section>
        <section class="card stack">${cardHead('Finances', '#/finances', 'Open finances')}
          ${owed || owingMe ? `<div class="finance-snapshot"><div><span>You owe</span><b>${money(owed)}</b></div><div><span>Owed to you</span><b>${money(owingMe)}</b></div></div>` : compactEmpty('No shared expenses yet.', '#/finances', 'Log an expense')}</section>
      </div>
    </div>`;
}

actions['home-event'] = (el) => { try { sessionStorage.setItem('roomie.open', JSON.stringify({ type: 'event', id: Number(el.dataset.id) })); } catch { /* the page still opens */ } location.hash = '#/calendar'; };

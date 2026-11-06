import { validCalendarDay } from '../lib/calendar-create.js';
// Slice (b): chores. The server owns the rules (rotation, daylight saving, who may do what);
// this page shows the data and sends the user's intent. Times are always shown in the household's timezone.
import { actions, forms, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, badge, closeModal, confirmDialog, empty, esc, fullName, ico, mhead, openModal, phead, personColor, showError, toast } from '../lib/dom.js';
import { monthDays } from '../../shared/home-schedule.ts';
import { dayName } from '../../shared/chore-dates.ts';

let choreView = 'list', choreMonth = null, choreScope = null;
let filter = 'all';     // 'all' | 'me' | userId
let sortBy = 'added';   // chart: 'added' | 'az' | 'assignee'
let D = null;           // { members, chores, assignments, swapRequests }
const STARTERS = [
  { key: 'trash', name: 'Take out the trash', description: 'Empty the kitchen and bathroom bins.', dayOfWeek: 1, dueTime: '19:00', effort: 'easy' },
  { key: 'dishes', name: 'Kitchen reset', description: 'Load dishes and wipe the counters.', dayOfWeek: 3, dueTime: '20:00', effort: 'medium' },
  { key: 'bathroom', name: 'Clean the bathroom', description: 'Sink, toilet, mirror, shower, and floor.', dayOfWeek: 6, dueTime: '10:00', effort: 'hard' },
  { key: 'vacuum', name: 'Vacuum shared spaces', description: 'Living room, hallway, and entry.', dayOfWeek: 0, dueTime: '16:00', effort: 'medium' },
];

const hid = () => household().householdId;
const tz = () => household().timezone;
const who = (id) => D.members.find((m) => m.userId === id);
const first = (id) => (id === S.user.userId ? 'You' : who(id)?.firstName ?? 'Someone');
const active = () => D.members.filter((m) => !m.leftDate);
const choreOf = (id) => D.chores.find((c) => c.choreId === id);
const asgOf = (id) => D.assignments.find((a) => a.assignmentId === id);
const ymdIn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(d));
const daysFromToday = (iso) => Math.round((Date.parse(`${ymdIn(iso)}T12:00:00Z`) - Date.parse(`${ymdIn(Date.now())}T12:00:00Z`)) / 86400000);
const whenFmt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: tz(), weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', '').replace(/(\d) (\d)/, '$1 · $2');
const doneFmt = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: tz(), month: 'short', day: 'numeric' });
const effortChip = (e) => `<span class="st effort effort-${e}" title="${e[0].toUpperCase() + e.slice(1)} effort">${e[0].toUpperCase() + e.slice(1)} ${e === 'easy' ? '·' : e === 'medium' ? '··' : '···'}</span>`;
const openRequestOn = (aid) => D.swapRequests.find((r) => r.requesterAssignmentId === aid || r.targetAssignmentId === aid);

export async function choresView() {
  const h = hid();
  const [{ members }, data] = await Promise.all([api(`/households/${h}/members`), api(`/households/${h}/chores`)]);
  D = { members, ...data };
  loadChoreDisplay();
  choreMonth ??= `${ymdIn(Date.now()).slice(0, 7)}-01`;
  return `${phead('Chores', 'A clear view of what needs doing, and whose turn it is.', `<button class="btn p" data-action="add-chore">${ico('plus', 16)} Add chore</button>`)}
    ${choreRequestsBoard()}<div class="page-content stack chores-content"><section class="card" id="chore-schedule">${scheduleView()}</section><div id="chore-overdue">${overdueView()}</div><details class="card chore-management"><summary>Manage chores</summary><div id="chore-rules">${chartView()}</div></details>${workloadView()}</div>`;

}
function choreRequestsBoard() {
  const requests = D.swapRequests.filter((r) => r.requesterUserId === S.user.userId || r.targetUserId === S.user.userId || (r.type === 'skip' && r.requesterUserId !== S.user.userId));
  const covers = requests.filter((r) => r.type === 'skip' && asgOf(r.requesterAssignmentId) && choreOf(asgOf(r.requesterAssignmentId).choreId));
  const swaps = requests.filter((r) => r.type === 'swap');
  const coverBoard = `<section class="card stack chore-requests-board"><div class="row sp"><h2>Cover Requests</h2>${covers.length ? badge(String(covers.length), 'warn') : ''}</div>
    ${covers.map((request) => {
      const assignment = asgOf(request.requesterAssignmentId), chore = choreOf(assignment.choreId);
      return `<article class="item stack cover-request-card"><h3>${esc(chore.choreName)}</h3>${choreDetailBody(assignment, chore)}
        <div class="stack"><h4>Cover request</h4><p class="home-board-message">${esc(request.requestMessage ?? '')}</p></div>
        <div class="acts" style="justify-content:flex-start"><button class="btn s" data-action="open-request" data-id="${request.swapId}">View chore</button></div></article>`;
    }).join('') || '<p class="hint">No chores need to be covered.</p>'}</section>`;
  const swapBoard = swaps.length ? `<section class="card stack chore-swap-board"><h2>Swap requests</h2>${swaps.map((request) => {
    const assignment = asgOf(request.requesterAssignmentId), target = asgOf(request.targetAssignmentId);
    return `<article class="item stack"><b>${esc(first(request.requesterUserId))} wants to swap ${esc(choreOf(assignment?.choreId)?.choreName ?? 'a chore')}</b>
      ${assignment ? `<div class="item row">${avatar(who(assignment.assignedUserId))}<div><b>${esc(fullName(who(assignment.assignedUserId)))}</b><div class="hint">${whenFmt(assignment.dueAt)}</div></div></div>` : ''}
      ${target ? `<p class="hint">For ${esc(choreOf(target.choreId)?.choreName ?? 'a chore')} (${whenFmt(target.dueAt)})</p>` : ''}
      <p class="home-board-message">${esc(request.requestMessage ?? '')}</p><div class="acts" style="justify-content:flex-start"><button class="btn s" data-action="open-request" data-id="${request.swapId}">${request.requesterUserId === S.user.userId ? 'View / cancel request' : 'Respond'}</button></div></article>`;
  }).join('')}</section>` : '';
  return coverBoard + swapBoard;
}
const chorePrefsKey = () => `roomie.chores.display.${S.user.userId}.${hid()}`;
function loadChoreDisplay() {
  if (choreScope === chorePrefsKey()) return;
  choreScope = chorePrefsKey(); choreMonth = null;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(choreScope) || '{}') ?? {}; } catch { /* Safe defaults. */ }
  choreView = saved.view === 'calendar' ? 'calendar' : 'list';
  filter = saved.filter === 'me' || active().some((m) => String(m.userId) === saved.filter) ? saved.filter : 'all';
}
function saveChoreDisplay() { try { localStorage.setItem(chorePrefsKey(), JSON.stringify({ view: choreView, filter })); } catch { /* Display remains usable. */ } }
function refreshChoreSchedule(focusInput) {
  const schedule = document.getElementById('chore-schedule');
  if (!schedule) return;
  schedule.innerHTML = scheduleView();
  document.getElementById('chore-overdue').innerHTML = overdueView();
  document.getElementById('chore-rules').innerHTML = chartView();
  if (focusInput) schedule.querySelector(`[data-input="${focusInput}"]`)?.focus();
}
inputs['chore-view'] = (el) => { if (!['calendar', 'list'].includes(el.value)) return; choreView = el.value; saveChoreDisplay(); refreshChoreSchedule('chore-view'); };
inputs['chore-filter'] = (el) => { filter = el.value; saveChoreDisplay(); refreshChoreSchedule('chore-filter'); };
inputs['chore-sort'] = (el) => { sortBy = el.value; document.getElementById('chore-rules').innerHTML = chartView(); };
actions['chore-month'] = (el) => { const date = new Date(`${choreMonth}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + Number(el.dataset.n)); choreMonth = `${date.toISOString().slice(0, 7)}-01`; refreshChoreSchedule(); };
const passes = (userId) => filter === 'all' || (filter === 'me' ? userId === S.user.userId : String(userId) === String(filter));

// ---- schedule ---------------------------------------------------------------------------------
function row(a) {
  const c = choreOf(a.choreId); if (!c) return '';
  const mine = a.assignedUserId === S.user.userId, d = daysFromToday(a.dueAt);
  const chip = a.isCompleted ? `<span class="st paid">Done ${doneFmt(a.completedAt)}</span>` : a.status === 'overdue' ? '<span class="st overdue">Overdue</span>' : d <= 1 ? `<span class="st today">${d === 0 ? 'Now' : 'Due soon'}</span>` : '<span class="st later">Later</span>';
  const req = openRequestOn(a.assignmentId);
  return `<div class="item cr click click-row ${a.isCompleted ? 'isdone' : ''}" data-action="chore-detail" data-id="${a.assignmentId}" tabindex="0">
    ${mine ? `<button class="doneb ${a.isCompleted ? 'on' : ''}" data-action="${a.isCompleted ? 'undo-chore' : 'done-chore'}" data-id="${a.assignmentId}" aria-label="${a.isCompleted ? 'Mark not done' : 'Mark done'}">${ico('check', 16)}</button>` : avatar(who(a.assignedUserId), '')}
    <div class="grow" style="min-width:0"><b class="nm truncate">${esc(c.choreName)}${c.repeats !== 'none' ? ' <span class="mute" title="Repeats">↻</span>' : ''}</b>
      <div class="hint">${mine ? 'You' : esc(first(a.assignedUserId))} · ${whenFmt(a.dueAt)}</div></div>
    ${req ? `<span class="st pending">${req.type === 'skip' ? 'Cover requested' : 'Swap requested'}</span>` : ''}${chip}${effortChip(c.effort)}<span class="row-chevron">${ico('chevron', 16)}</span></div>`;
}
function visibleAssignments() { return D.assignments.filter((a) => choreOf(a.choreId) && passes(a.assignedUserId)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)); }
const choreDayLabel = (day) => day === ymdIn(Date.now()) ? 'Today' : new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
function workloadView() {
  const counts = active().map((member) => [member, D.assignments.filter((a) => !a.isCompleted && a.assignedUserId === member.userId).length]);
  const max = Math.max(1, ...counts.map(([, count]) => count));
  return `<section class="card"><div class="row sp"><h2>Household workload</h2><span class="hint workload-label">Open chores</span></div>${counts.map(([member, count]) => `<div class="row" style="padding:7px 0">${avatar(member, 'sm')}<span class="truncate" style="width:74px">${esc(first(member.userId))}</span><div class="bar grow" style="--w:${Math.round(count / max * 100)}%"><i></i></div><b class="mute" style="width:22px;text-align:right">${count}</b></div>`).join('')}</section>`;
}
function overdueView() {
  const overdue = visibleAssignments().filter((a) => !a.isCompleted && ymdIn(a.dueAt) < ymdIn(Date.now()));
  return overdue.length ? `<details class="card"><summary>Overdue (${overdue.length})</summary><div class="stack">${overdue.map(row).join('')}</div></details>` : '';
}
function scheduleView() {
  const title = new Date(`${choreMonth}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const people = active();
  const toolbar = `<div class="home-schedule-toolbar event-schedule-toolbar"><div class="month-nav"><button class="btn s" data-action="chore-month" data-n="-1" aria-label="Previous month">‹</button><div class="row"><h2>${title}</h2></div><button class="btn s" data-action="chore-month" data-n="1" aria-label="Next month">›</button></div><select class="input home-view-select" data-input="chore-view" aria-label="Schedule view"><option value="calendar" ${choreView === 'calendar' ? 'selected' : ''}>Calendar view</option><option value="list" ${choreView === 'list' ? 'selected' : ''}>List view</option></select></div><div class="filters event-schedule-filters"><select class="input" data-input="chore-filter" aria-label="Show chores for"><option value="all" ${filter === 'all' ? 'selected' : ''}>Everyone</option><option value="me" ${filter === 'me' ? 'selected' : ''}>Just mine</option>${people.filter((m) => m.userId !== S.user.userId).map((m) => `<option value="${m.userId}" ${String(filter) === String(m.userId) ? 'selected' : ''}>${esc(m.firstName)}</option>`).join('')}</select></div>`;
  const items = visibleAssignments();
  if (!D.chores.length) return toolbar + empty('🧹', 'No chores yet', 'Add one yourself or start with a few common household chores.', '<button class="btn s" data-action="starter-chores">Add common chores</button>');
  if (choreView === 'list') {
    const upcoming = items.filter((a) => ymdIn(a.dueAt) >= ymdIn(Date.now()) && ymdIn(a.dueAt).slice(0, 7) === choreMonth.slice(0, 7));
    return toolbar + (upcoming.length ? [...new Set(upcoming.map((a) => ymdIn(a.dueAt)))].map((day) => `<section class="stack home-day"><h3>${esc(choreDayLabel(day))}</h3>${upcoming.filter((a) => ymdIn(a.dueAt) === day).map(row).join('')}</section>`).join('') : '<p class="home-empty">No chores from today onward in this month.</p>');
  }
  return `${toolbar}<div class="mgrid mhead">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<span>${day}</span>`).join('')}</div><div class="mgrid home-month">${monthDays(choreMonth).map((day) => {
    const due = items.filter((a) => ymdIn(a.dueAt) === day);
    return `<button class="day2 ${day.slice(0, 7) !== choreMonth.slice(0, 7) ? 'out' : ''} ${day === ymdIn(Date.now()) ? 'today' : ''}" data-action="chore-day" data-day="${day}" aria-label="${esc(choreDayLabel(day))}, ${due.length} chores" ${day === ymdIn(Date.now()) ? 'aria-current="date"' : ''}><span class="dn">${Number(day.slice(8))}</span>${due.slice(0, 3).map((a) => `<span class="home-calendar-item ${a.isCompleted ? 'completed' : ''}" style="--ev:${personColor(a.assignedUserId)}"><span>${esc(first(a.assignedUserId))} · ${new Date(a.dueAt).toLocaleTimeString('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' })}</span><b>${esc(choreOf(a.choreId).choreName)}</b></span>`).join('')}${due.length > 3 ? `<span class="home-more">+${due.length - 3} more</span>` : ''}<span class="home-mobile-count" aria-hidden="true">${due.length || ''}</span></button>`;
  }).join('')}</div>`;
}
actions['chore-day'] = (button) => {
  const day = button.dataset.day, items = visibleAssignments().filter((a) => ymdIn(a.dueAt) === day);
  openModal(`${mhead(esc(choreDayLabel(day)))}<div class="stack">${items.map(row).join('') || '<p class="mute">No chores on this day.</p>'}</div><div class="acts"><button class="btn p" data-action="add-chore" data-day="${esc(day)}">Add chore</button></div>`);
};

// ---- chore chart (the rules) ------------------------------------------------------------------
function chartView() {
  let list = D.chores.filter((c) => { const next = nextAsg(c); return filter === 'all' || c.rotation.some((u) => passes(u)) || (next && passes(next.assignedUserId)); });
  const nm = (c) => (nextAsg(c) ? first(nextAsg(c).assignedUserId) : 'zzz');
  list = [...list].sort(sortBy === 'az' ? (a, b) => a.choreName.localeCompare(b.choreName) : sortBy === 'assignee' ? (a, b) => nm(a).localeCompare(nm(b)) || a.choreName.localeCompare(b.choreName) : (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!list.length) return `<div class="page-content chores-content"><section class="card">${empty('🧹', D.chores.length ? 'Nothing matches' : 'No chores yet', D.chores.length ? 'Try a different person.' : 'Add one yourself or start with common chores.', D.chores.length ? '' : '<button class="btn s" data-action="starter-chores">Add common chores</button>')}</section></div>`;
  return `<div class="page-content chores-content"><section class="card"><div class="row sp"><h2>All chores</h2>${badge(`${list.length}`, 'gray')}</div><select class="input" data-input="chore-sort" aria-label="Sort chores"><option value="added" ${sortBy === 'added' ? 'selected' : ''}>Sort: date added</option><option value="az" ${sortBy === 'az' ? 'selected' : ''}>Sort: A to Z</option><option value="assignee" ${sortBy === 'assignee' ? 'selected' : ''}>Sort: assignee</option></select>${list.map((c) => {
    const next = nextAsg(c); const rot = c.rotation.filter((u) => who(u) && !who(u).leftDate);
    return `<div class="item cr click click-row" data-action="chore-rule" data-id="${c.choreId}" tabindex="0"><div class="grow" style="min-width:0"><b class="truncate">${esc(c.choreName)}</b>
      <div class="hint">${esc(c.schedule)}${c.repeats !== 'none' && rot.length > 1 ? ` · takes turns: ${rot.map((u) => esc(first(u))).join(', ')}` : ''}</div>
      <div class="hint">${next ? `Next: ${esc(first(next.assignedUserId))}, ${whenFmt(next.dueAt)}` : c.repeats === 'none' ? 'Done' : 'Nobody to assign (everyone moved out)'}</div></div>${effortChip(c.effort)}<span class="row-chevron">${ico('chevron', 16)}</span></div>`;
  }).join('')}</section></div>`;
}
const nextAsg = (c) => D.assignments.filter((a) => a.choreId === c.choreId && !a.isCompleted).sort((x, y) => Date.parse(x.dueAt) - Date.parse(y.dueAt))[0] ?? null;

// ---- done / undo ------------------------------------------------------------------------------
const refresh = () => window.dispatchEvent(new Event('roomie:render'));
actions['done-chore'] = async (el) => {
  const row = el.closest('.cr'); row?.classList.add('completing');
  await new Promise((resolve) => setTimeout(resolve, 220));
  try { await api(`/households/${hid()}/assignments/${el.dataset.id}/complete`, { method: 'POST' }); }
  catch (error) { row?.classList.remove('completing'); throw error; }
  closeModal(); toast('Nice work — chore complete.'); refresh();
};
actions['undo-chore'] = async (el) => { await api(`/households/${hid()}/assignments/${el.dataset.id}/uncomplete`, { method: 'POST' }); closeModal(); toast('Marked not done'); refresh(); };
actions['remind-chore'] = async (el) => { await api(`/households/${hid()}/assignments/${el.dataset.id}/remind`, { method: 'POST' }); closeModal(); toast('Reminder sent'); refresh(); };

// Open the exact occurrence from Home using the same detail renderer as the Chores page.
export async function openChoreDetails(householdId, assignmentId) {
  const [{ members }, data] = await Promise.all([api(`/households/${householdId}/members`), api(`/households/${householdId}/chores`)]);
  if (hid() !== householdId) return;
  D = { members, ...data };
  if (!asgOf(assignmentId)) throw new Error('This chore occurrence is no longer available.');
  actions['chore-detail']({ dataset: { id: assignmentId } });
}
function coverRequestDetails(request) {
  const mine = request.requesterUserId === S.user.userId;
  const message = `<h4>Cover request</h4><p>${mine ? 'You asked someone to cover this occurrence.' : `${esc(fullName(who(request.requesterUserId)))} asked someone to cover this occurrence.`}</p><p class="home-board-message">${esc(request.requestMessage ?? '')}</p>`;
  return mine ? `<section class="stack">${message}<span class="st unpaid">Waiting for a volunteer</span><div class="acts"><button class="btn" data-action="answer" data-answer="withdraw" data-id="${request.swapId}">Cancel request</button></div></section>`
    : `<form class="stack" data-form="respond" data-id="${request.swapId}" data-type="skip">${message}<label class="fld"><span>Reply (optional)</span><textarea class="input" name="message" rows="2" maxlength="300"></textarea></label><div class="err" role="alert"></div><div class="acts"><button type="button" class="btn" data-action="answer" data-answer="decline" data-id="${request.swapId}">Decline</button><button class="btn p" type="submit">Cover it</button></div></form>`;
}

function choreDetailBody(a, c) {
  const mine = a.assignedUserId === S.user.userId;
  const status = a.isCompleted ? `<span class="st paid">Done ${doneFmt(a.completedAt)}</span>` : a.status === 'overdue' ? '<span class="st overdue">Overdue</span>' : '<span class="st later">Upcoming</span>';
  return `    <div class="row" style="gap:8px;flex-wrap:wrap">${status}${effortChip(c.effort)}<span class="mute">${esc(c.schedule)}</span></div>
    ${c.description ? `<p>${esc(c.description)}</p>` : ''}
    <div class="item row chore-occurrence">${avatar(who(a.assignedUserId))}<div class="grow"><b>${mine ? 'You' : esc(fullName(who(a.assignedUserId)))}</b><div class="hint">${whenFmt(a.dueAt)}${who(a.assignedUserId)?.leftDate ? ' · moved out' : ''}</div></div></div>
    ${c.repeats !== 'none' && c.rotation.length > 1 ? `<p class="hint">Takes turns: ${c.rotation.map((u) => esc(first(u))).join(', ')}</p>` : ''}`;
}

// ---- detail -----------------------------------------------------------------------------------
actions['chore-detail'] = (el) => {
  const a = asgOf(Number(el.dataset.id)); if (!a) return; const c = choreOf(a.choreId);
  const mine = a.assignedUserId === S.user.userId, req = openRequestOn(a.assignmentId), upcoming = !a.isCompleted && Date.parse(a.dueAt) > Date.now();
  openModal(`${mhead(esc(c.choreName))}${choreDetailBody(a, c)}
    ${req?.type === 'skip' ? coverRequestDetails(req) : req ? `<p class="hint">There is an open ${req.type === 'swap' ? 'swap' : 'cover'} request on this chore.</p><button class="btn s" data-action="open-request" data-id="${req.swapId}">View request</button>` : ''}
    <div class="acts" style="justify-content:flex-start;flex-wrap:wrap">
      ${mine && !a.isCompleted ? `<button class="btn p" data-action="done-chore" data-id="${a.assignmentId}">Mark done</button>` : ''}
      ${mine && a.isCompleted ? `<button class="btn" data-action="undo-chore" data-id="${a.assignmentId}">Undo</button>` : ''}
      ${!mine && !a.isCompleted ? `<button class="btn" data-action="remind-chore" data-id="${a.assignmentId}">Send a reminder</button>` : ''}
      ${mine && upcoming && !req ? `<button class="btn" data-action="ask" data-type="swap" data-id="${a.assignmentId}">Ask to swap</button><button class="btn" data-action="ask" data-type="skip" data-id="${a.assignmentId}">Ask someone to cover</button>` : ''}
      ${c.canEdit ? `<button class="btn" data-action="edit-chore" data-id="${c.choreId}">Edit</button><button class="btn d" data-action="delete-chore" data-id="${c.choreId}">Delete chore</button>` : ''}</div>`);
};
actions['chore-rule'] = (el) => { const c = choreOf(Number(el.dataset.id)); const a = nextAsg(c) ?? D.assignments.filter((x) => x.choreId === c.choreId).sort((x, y) => Date.parse(y.dueAt) - Date.parse(x.dueAt))[0]; if (a) actions['chore-detail']({ dataset: { id: a.assignmentId } }); else actions['edit-chore'](el); };

// ---- add / edit / delete a chore --------------------------------------------------------------
actions['add-chore'] = (el) => {
  const selectedDay = validCalendarDay(el?.dataset?.day) ? el.dataset.day : null;
  const today = selectedDay ?? new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  const people = active();
  openModal(`${mhead('Add a chore')}
    <form class="stack" data-form="chore-add" autocomplete="off">
      <label class="fld"><span>What needs doing?</span><input class="input" name="choreName" required maxlength="120" placeholder="Take out the trash"></label>
      <label class="fld"><span>Details (optional)</span><textarea class="input" name="description" rows="2" maxlength="500" placeholder="Kitchen and bathroom bins to the curb"></textarea></label>
      <div class="inline-grid"><label class="fld"><span>How hard?</span><select class="input" name="effort"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></label>
        <label class="fld"><span>Time</span><input class="input" name="dueTime" type="time" value="19:00" required></label></div>
      <div class="fld"><span>How often?</span><div class="methods" style="grid-template-columns:repeat(3,1fr)">
        <label><input type="radio" name="repeats" value="none" ${selectedDay ? 'checked' : ''} data-input="chore-type">One time</label>
        <label><input type="radio" name="repeats" value="weekly" ${selectedDay ? '' : 'checked'} data-input="chore-type">Every week</label>
        <label><input type="radio" name="repeats" value="monthly" data-input="chore-type">Every month</label></div></div>
      <label class="fld" id="f-date"><span id="l-date">Starting</span><input class="input" name="date" type="date" value="${today}"></label>
      <label class="fld" id="f-dow"><span>Day of the week</span><select class="input" name="dow">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${selectedDay && d === date.getUTCDay() ? 'selected' : ''}>${dayName(d)}</option>`).join('')}</select></label>
      <label class="fld hidden" id="f-dom"><span>Day of the month (31 means the last day)</span><input class="input" name="dom" type="number" min="1" max="31" value="${selectedDay ? date.getUTCDate() : 1}"></label>
      <div class="fld"><span>Who does it?</span><div class="methods" style="grid-template-columns:repeat(2,1fr)">
        <label><input type="radio" name="mode" value="person" checked data-input="chore-who">One person</label>
        <label id="mode-rotate"><input type="radio" name="mode" value="rotate" data-input="chore-who">Take turns</label></div></div>
      <label class="fld" id="f-person"><span>Person</span><select class="input" name="person">${people.map((m) => `<option value="${m.userId}" ${m.userId === S.user.userId ? 'selected' : ''}>${esc(fullName(m))}${m.userId === S.user.userId ? ' (you)' : ''}</option>`).join('')}</select></label>
      <div class="fld hidden" id="f-rot"><span>Turn order (top goes first)</span><div class="opt-list rotation-list">${people.map((m) => `<div class="rotation-row" data-rotation-row data-name="${esc(fullName(m))}"><button type="button" class="rotation-grip" draggable="true" data-rotation-drag aria-label="Drag ${esc(fullName(m))} to reorder" title="Drag to reorder">⠿</button><label class="chk"><input type="checkbox" name="rot" value="${m.userId}" checked> ${avatar(m, 'sm')} <span>${esc(fullName(m))}</span></label><div class="rotation-moves"><button type="button" class="btn s" data-action="rotation-move" data-direction="up" aria-label="Move ${esc(fullName(m))} up">↑</button><button type="button" class="btn s" data-action="rotation-move" data-direction="down" aria-label="Move ${esc(fullName(m))} down">↓</button></div></div>`).join('')}</div><span class="sr-only" id="rotation-status" role="status" aria-live="polite"></span></div>
      <div class="err" role="alert"></div>
      <div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit">Add chore</button></div>
    </form>`);
  inputs['chore-type'](); inputs['chore-who'](); wireRotation();
};
// FormData reads selected checkboxes in DOM order, which is the rotation order sent to the API.
function updateRotation(row) {
  const list = document.querySelector('.rotation-list'); if (!list) return;
  const rows = [...list.children];
  rows.forEach((item, i) => {
    item.querySelector('[data-direction=up]').disabled = i === 0;
    item.querySelector('[data-direction=down]').disabled = i === rows.length - 1;
  });
  if (row) document.getElementById('rotation-status').textContent = `${row.dataset.name} moved to position ${rows.indexOf(row) + 1} of ${rows.length}.`;
}
actions['rotation-move'] = (button) => {
  const row = button.closest('[data-rotation-row]'); if (!row) return;
  const neighbor = button.dataset.direction === 'up' ? row.previousElementSibling : row.nextElementSibling;
  if (!neighbor) return;
  if (button.dataset.direction === 'up') row.parentElement.insertBefore(row, neighbor);
  else row.parentElement.insertBefore(row, neighbor.nextElementSibling);
  updateRotation(row);
  if (button.disabled) row.querySelector('[data-rotation-drag]').focus();
};
function wireRotation() {
  const list = document.querySelector('.rotation-list'); if (!list) return;
  let dragged = null;
  const clear = () => { list.querySelectorAll('.dragging,.drag-target').forEach((row) => row.classList.remove('dragging', 'drag-target')); };
  list.addEventListener('dragstart', (event) => {
    const handle = event.target.closest?.('[data-rotation-drag]');
    if (!handle) { event.preventDefault(); return; }
    dragged = handle.closest('[data-rotation-row]');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.querySelector('[name=rot]').value);
    dragged.classList.add('dragging');
  });
  list.addEventListener('dragover', (event) => {
    const target = event.target.closest?.('[data-rotation-row]');
    if (!dragged || !target || target === dragged) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    list.querySelectorAll('.drag-target').forEach((row) => row.classList.remove('drag-target'));
    target.classList.add('drag-target');
  });
  list.addEventListener('drop', (event) => {
    const target = event.target.closest?.('[data-rotation-row]');
    if (!dragged || !target || target === dragged) return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    list.insertBefore(dragged, event.clientY > rect.top + rect.height / 2 ? target.nextElementSibling : target);
    updateRotation(dragged); dragged.querySelector('[data-rotation-drag]').focus();
    clear(); dragged = null;
  });
  list.addEventListener('dragend', () => { clear(); dragged = null; });
  updateRotation();
}
actions['starter-chores'] = () => openModal(`${mhead('Add common chores')}<form class="stack" data-form="starter-chores"><p class="hint">Pick a starter set. Repeating chores rotate through the current household.</p>
  <div class="opt-list starter-list">${STARTERS.map((item) => `<label class="chk"><input type="checkbox" name="starter" value="${item.key}" checked><span class="grow"><b>${item.name}</b><span class="hint">${dayName(item.dayOfWeek)} · ${item.dueTime.replace(/^0/, '')}</span></span>${effortChip(item.effort)}</label>`).join('')}</div>
  <div class="err" role="alert"></div><div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit">Add selected</button></div></form>`);
forms['starter-chores'] = async (form) => {
  const picked = new Set(new FormData(form).getAll('starter').map(String));
  if (!picked.size) return showError(form, 'Choose at least one chore.');
  const people = active(), date = new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date());
  const assignment = people.length > 1 ? { mode: 'rotate', userIds: people.map((m) => m.userId) } : { mode: 'person', userId: S.user.userId };
  try {
    await Promise.all(STARTERS.filter((item) => picked.has(item.key)).map((item) => api(`/households/${hid()}/chores`, { method: 'POST', body: {
      choreName: item.name, description: item.description, repeats: 'weekly', dayOfWeek: item.dayOfWeek, date, dueTime: item.dueTime, effort: item.effort, assignment,
    } })));
  } catch (error) { return showError(form, error.message); }
  closeModal(); toast(`Added ${picked.size} starter ${picked.size === 1 ? 'chore' : 'chores'}.`); refresh();
};
inputs['chore-type'] = () => {
  const f = document.querySelector('form[data-form=chore-add]'); if (!f) return;
  const r = f.elements.namedItem('repeats').value;
  document.getElementById('f-dow').classList.toggle('hidden', r !== 'weekly');
  document.getElementById('f-dom').classList.toggle('hidden', r !== 'monthly');
  document.getElementById('l-date').textContent = r === 'none' ? 'Date' : 'Starting';
  // taking turns only makes sense for something that repeats
  const rotate = document.getElementById('mode-rotate'); rotate.classList.toggle('hidden', r === 'none');
  if (r === 'none' && f.elements.namedItem('mode').value === 'rotate') { f.elements.namedItem('mode').value = 'person'; inputs['chore-who'](); }
};
inputs['chore-who'] = () => {
  const f = document.querySelector('form[data-form=chore-add]'); if (!f) return;
  const rot = f.elements.namedItem('mode').value === 'rotate';
  document.getElementById('f-person').classList.toggle('hidden', rot);
  document.getElementById('f-rot').classList.toggle('hidden', !rot);
};
forms['chore-add'] = async (form) => {
  const f = new FormData(form), repeats = f.get('repeats');
  const body = { choreName: f.get('choreName'), description: String(f.get('description')).trim() || null, effort: f.get('effort'), repeats, dueTime: f.get('dueTime'),
    assignment: f.get('mode') === 'rotate' ? { mode: 'rotate', userIds: f.getAll('rot').map(Number) } : { mode: 'person', userId: Number(f.get('person')) } };
  if (repeats === 'none') body.date = f.get('date');
  if (repeats === 'weekly') { body.dayOfWeek = Number(f.get('dow')); body.date = f.get('date'); }
  if (repeats === 'monthly') { body.dayOfMonth = Number(f.get('dom')); body.date = f.get('date'); }
  let r; try { r = await api(`/households/${hid()}/chores`, { method: 'POST', body }); } catch (e) { return showError(form, e.message); }
  closeModal(); toast(r.occurrences ? `Added. ${r.occurrences} upcoming ${r.occurrences === 1 ? 'turn is' : 'turns are'} on the schedule.` : 'Added.'); refresh();
};
actions['edit-chore'] = (el) => {
  const c = choreOf(Number(el.dataset.id));
  openModal(`${mhead('Edit chore')}<form class="stack" data-form="chore-edit" data-id="${c.choreId}">
    <label class="fld"><span>Name</span><input class="input" name="choreName" required maxlength="120" value="${esc(c.choreName)}"></label>
    <label class="fld"><span>Details</span><textarea class="input" name="description" rows="2" maxlength="500">${esc(c.description ?? '')}</textarea></label>
    <label class="fld"><span>How hard?</span><select class="input" name="effort">${['easy', 'medium', 'hard'].map((e) => `<option value="${e}" ${c.effort === e ? 'selected' : ''}>${e[0].toUpperCase() + e.slice(1)}</option>`).join('')}</select></label>
    <p class="hint">To change when it happens or who does it, delete it and add it again.</p>
    <div class="err" role="alert"></div><div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit">Save</button></div></form>`);
};
forms['chore-edit'] = async (form) => {
  const f = new FormData(form);
  try { await api(`/households/${hid()}/chores/${form.dataset.id}`, { method: 'PATCH', body: { choreName: f.get('choreName'), description: String(f.get('description')).trim() || null, effort: f.get('effort') } }); } catch (e) { return showError(form, e.message); }
  closeModal(); toast('Saved'); refresh();
};
actions['delete-chore'] = async (el) => {
  if (!await confirmDialog('Delete chore?', 'This removes its schedule, upcoming turns, and open requests.')) return;
  await api(`/households/${hid()}/chores/${el.dataset.id}`, { method: 'DELETE' });
  closeModal(); toast('Chore deleted'); refresh();
};

// ---- swap and skip ----------------------------------------------------------------------------
actions.ask = (el) => {
  const a = asgOf(Number(el.dataset.id)), c = choreOf(a.choreId), type = el.dataset.type;
  const others = type === 'swap' ? D.assignments.filter((x) => !x.isCompleted && x.assignedUserId !== S.user.userId && Date.parse(x.dueAt) > Date.now() && who(x.assignedUserId) && !who(x.assignedUserId).leftDate && !openRequestOn(x.assignmentId)).sort((x, y) => Date.parse(x.dueAt) - Date.parse(y.dueAt)) : [];
  openModal(`${mhead(type === 'swap' ? `Swap ${esc(c.choreName)}` : `Ask someone to cover ${esc(c.choreName)}`)}
    <form class="stack" data-form="ask" data-type="${type}" data-id="${a.assignmentId}">
      <p class="mute">${type === 'swap' ? `Pick one of a roommate's chores to trade for your ${esc(c.choreName)} on ${whenFmt(a.dueAt)}.` : 'Everyone else in the house is asked. The first person to say yes takes it.'}</p>
      ${type === 'swap' ? (others.length ? `<div class="fld"><span>Trade for</span><div class="opt-list">${others.map((x, i) => `<label class="radio-row"><input type="radio" name="target" value="${x.assignmentId}" ${i === 0 ? 'checked' : ''}>${avatar(who(x.assignedUserId), 'sm')}<span class="grow"><b>${esc(choreOf(x.choreId).choreName)}</b><div class="hint">${esc(first(x.assignedUserId))} · ${whenFmt(x.dueAt)}</div></span></label>`).join('')}</div></div>` : '<div class="note">There are no roommate chores to trade for right now.</div>') : ''}
      <label class="fld"><span>Why? (they will see this)</span><textarea class="input" name="message" rows="2" required maxlength="300" placeholder="Visiting family this weekend"></textarea></label>
      <div class="err" role="alert"></div><div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit" ${type === 'swap' && !others.length ? 'disabled' : ''}>Send request</button></div></form>`);
};
forms.ask = async (form) => {
  const f = new FormData(form), type = form.dataset.type;
  const body = { type, requesterAssignmentId: Number(form.dataset.id), message: f.get('message') };
  if (type === 'swap') body.targetAssignmentId = Number(f.get('target'));
  try { await api(`/households/${hid()}/swap-requests`, { method: 'POST', body }); } catch (e) { return showError(form, e.message); }
  closeModal(); toast('Request sent. They were notified.'); refresh();
};
actions['open-request'] = (el) => {
  const r = D.swapRequests.find((x) => x.swapId === Number(el.dataset.id)); if (!r) return;
  const ra = asgOf(r.requesterAssignmentId), ta = r.targetAssignmentId ? asgOf(r.targetAssignmentId) : null, mineReq = r.requesterUserId === S.user.userId;
  const rc = choreOf(ra?.choreId), tc = choreOf(ta?.choreId);
  if (r.type === 'skip') {
    if (!ra) { toast('This chore occurrence is no longer available.'); return; }
    actions['chore-detail']({ dataset: { id: ra.assignmentId } }); return;
  }
  if (mineReq) {
    openModal(`${mhead('Your request')}<p>${r.type === 'swap' ? `You asked ${esc(first(r.targetUserId))} to swap <b>${esc(rc?.choreName)}</b> (${ra ? whenFmt(ra.dueAt) : ''}) for <b>${esc(tc?.choreName)}</b> (${ta ? whenFmt(ta.dueAt) : ''}).` : `You asked the house to cover <b>${esc(rc?.choreName)}</b> (${ra ? whenFmt(ra.dueAt) : ''}).`}</p><p class="hint">“${esc(r.requestMessage ?? '')}”</p>
      <div class="acts"><button class="btn" data-action="close-modal">Keep it</button><button class="btn d" data-action="answer" data-answer="withdraw" data-id="${r.swapId}">Withdraw</button></div>`);
    return;
  }
  openModal(`${mhead(r.type === 'swap' ? 'Swap request' : 'Can you cover?')}
    <form class="stack" data-form="respond" data-id="${r.swapId}" data-type="${r.type}">
      <div class="item row t">${avatar(who(r.requesterUserId))}<div class="grow"><b>${esc(first(r.requesterUserId))}</b> ${r.type === 'swap' ? `wants to swap their <b>${esc(rc?.choreName)}</b> (${ra ? whenFmt(ra.dueAt) : ''}) for your <b>${esc(tc?.choreName)}</b> (${ta ? whenFmt(ta.dueAt) : ''}).` : `asked someone to cover <b>${esc(rc?.choreName)}</b> (${ra ? whenFmt(ra.dueAt) : ''}).`}<div class="hint">“${esc(r.requestMessage ?? '')}”</div></div></div>
      <label class="fld"><span>Reply (optional)</span><textarea class="input" name="message" rows="2" maxlength="300"></textarea></label>
      <div class="err" role="alert"></div>
      <div class="acts"><button type="button" class="btn" data-action="answer" data-answer="decline" data-id="${r.swapId}">${r.type === 'swap' ? 'Decline' : 'Decline'}</button><button class="btn p" type="submit">${r.type === 'swap' ? 'Accept swap' : 'Cover it'}</button></div></form>`);
};
const sendAnswer = async (swapId, action, message, form) => {
  try { await api(`/households/${hid()}/swap-requests/${swapId}`, { method: 'PATCH', body: { action, message: message || undefined } }); } catch (e) { if (form) return showError(form, e.message); throw e; }
  closeModal(); toast(action === 'accept' ? 'Done. The schedule is updated.' : action === 'withdraw' ? 'Request withdrawn' : 'Answered'); refresh();
};
forms.respond = (form) => sendAnswer(Number(form.dataset.id), 'accept', String(new FormData(form).get('message')).trim(), form);
actions.answer = (el) => sendAnswer(Number(el.dataset.id), el.dataset.answer, String(document.querySelector('form[data-form=respond] [name=message]')?.value ?? '').trim(), document.querySelector('form[data-form=respond]'));


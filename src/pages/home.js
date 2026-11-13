import { openLinkedEvent } from './calendar.js';
import { scheduleToolbar } from '../components/schedule-toolbar.js';
// Home shows one household schedule in two formats; feature pages own editing and responses.
import { actions, forms, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, closeModal, esc, mhead, openModal, itemColor, phead, showError, toast } from '../lib/dom.js';
import { addDays } from '../../shared/chore-dates.ts';
import { monthDays, scheduleItems } from '../../shared/home-schedule.ts';
import { householdBoard, announcementForm } from '../components/household-board.js';
import { openChoreDetails } from './chores.js';
import { fitHomeWidgets, normalizeHomeLayout, HOME_PRESETS } from '../components/home-layout.js';
import { queueCalendarCreate } from '../lib/calendar-create.js';

import { homeFinances } from '../components/home-finances.js';
import { prepareFinanceActivity } from './finances.js';

const hid = () => household().householdId;
const tz = () => household().timezone;
const ymdIn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(d));
const timeFmt = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: tz(), hour: 'numeric', minute: '2-digit' });
const dayLabel = (day) => day === ymdIn(Date.now()) ? 'Today' : day === addDays(ymdIn(Date.now()), 1) ? 'Tomorrow'
  : new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
// Display preferences are local to each user and household; shared data is unchanged.
const viewKey = () => `roomie.home.view.${S.user.userId}.${hid()}`;
const getView = () => { try { return localStorage.getItem(viewKey()) === 'calendar' ? 'calendar' : 'list'; } catch { return 'list'; } };
const layoutKey = () => `roomie.home.layout.${S.user.userId}.${hid()}`;
const widgetNames = { schedule: 'Schedule', board: 'Household board', finances: 'Finances' };
const presetKey = () => `${layoutKey()}.preset`;
const defaultLayout = () => [{ id: 'schedule', size: 'expanded' }, { id: 'board', size: 'compact' }, { id: 'finances', size: 'compact' }];
function getLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey()));
    if (Array.isArray(saved) && saved.length === 3 && new Set(saved.map((w) => w.id)).size === 3 && saved.every((w) => Object.hasOwn(widgetNames, w.id) && ['compact', 'expanded'].includes(w.size) && (w.column === undefined || Number.isInteger(w.column) && w.column >= 1 && w.column <= 3))) return normalizeHomeLayout(saved, layoutMode);
  } catch { /* Use the default when storage is unavailable or invalid. */ }
  return normalizeHomeLayout(defaultLayout(), layoutMode);
}
let layoutMode = 'focus-left', layout = defaultLayout(), editing = false, editingKey = null;
function getPreset() {
  try {
    const preset = localStorage.getItem(presetKey());
    if (HOME_PRESETS.includes(preset)) return preset;
    const old = JSON.parse(localStorage.getItem(layoutKey()) || 'null');
    if (Array.isArray(old) && old.length === 3 && old.every((w) => w.size === 'compact')) return 'equal';
  } catch { /* Ignore invalid or unavailable preferences. */ }
  return 'focus-left';
}
function presetChoices() {
  const diagrams = {
    'focus-left': '<rect x="1" y="1" width="39" height="38" rx="3"/><rect x="44" y="1" width="19" height="17" rx="3"/><rect x="44" y="22" width="19" height="17" rx="3"/>',
    equal: '<rect x="1" y="1" width="18" height="38" rx="3"/><rect x="23" y="1" width="18" height="38" rx="3"/><rect x="45" y="1" width="18" height="38" rx="3"/>',
    'focus-right': '<rect x="1" y="1" width="19" height="17" rx="3"/><rect x="1" y="22" width="19" height="17" rx="3"/><rect x="24" y="1" width="39" height="38" rx="3"/>',
  };
  return `<div class="home-layout-choices" ${editing ? '' : 'hidden'}><span class="home-layout-label" id="home-layout-label">Layout</span><div class="home-layout-options" role="group" aria-labelledby="home-layout-label">${[['focus-left', 'Wide left'], ['equal', 'Equal columns'], ['focus-right', 'Wide right']].map(([key, label]) => `<button class="btn home-layout-choice" data-action="home-layout-preset" data-layout-preset="${key}" aria-pressed="${layoutMode === key}"><svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">${diagrams[key]}</svg><span>${label}</span></button>`).join('')}</div><p class="hint home-layout-hint">Drag section headers to rearrange your dashboard.</p></div>`;
}
const widgetSize = (id) => layout.find((w) => w.id === id)?.size;
let monthStart = null, monthHousehold = null, D = null, homeBoardArchive = false;

function row(item) {
  const member = D.members.find((m) => m.userId === item.userId);
  const name = item.userId === S.user.userId ? 'You' : member?.firstName || 'Someone';
  const overdue = item.kind === 'chore' && !item.completed && Date.parse(item.at) < Date.now();
  return `<a class="item click row ev home-schedule-row ${item.completed ? 'completed' : ''} ${item.approval?.status ?? ''}" href="#/${item.kind === 'event' ? 'calendar' : 'chores'}" data-action="home-open" data-kind="${item.kind}" data-id="${item.eventId ?? ''}" style="--ev:${itemColor(item.kind)}">
    <span class="evbar"></span><div class="grow"><div class="home-item-heading"><span class="home-kind">${esc(item.label)}</span>${item.approval?.total ? `<span class="st ${item.approval.status === 'confirmed' ? 'paid' : item.approval.status === 'changes_requested' ? 'disputed' : 'unpaid'}">${item.approval.label} · ${item.approval.approved} of ${item.approval.total} approved</span>` : ''}${item.completed ? '<span class="st paid">Completed</span>' : overdue ? '<span class="st overdue">Overdue</span>' : ''}</div><b>${esc(item.name)}</b>
    <div class="hint">${timeFmt(item.at)} · ${item.kind === 'event' ? 'Added by ' : ''}${esc(name)}${item.location ? ` · ${esc(item.location)}` : ''}</div></div>${avatar(member, 'sm')}</a>`;
}

function monthNav(view) {
  const title = new Date(`${monthStart}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return scheduleToolbar({ title, monthAction: 'home-month', viewInput: 'home-view', view });
}

const upcomingMonthItems = () => D.items.filter((item) => item.ymd >= ymdIn(Date.now()) && item.ymd.slice(0, 7) === monthStart.slice(0, 7));
function monthList(items) {
  return items.length ? [...new Set(items.map((item) => item.ymd))].map((day) => `<section class="stack home-day"><h3>${esc(dayLabel(day))}</h3>${items.filter((item) => item.ymd === day).map(row).join('')}</section>`).join('') : '<p class="home-empty">No events or chores from today onward in this month.</p>';
}
function listView() {
  const items = upcomingMonthItems();
  return `${monthNav('list')}${monthList(items.slice(0, 5))}${items.length > 5 ? `<button class="btn s" data-action="home-month-list">View all ${items.length} items</button>` : ''}`;
}
actions['home-month-list'] = () => {
  const title = new Date(`${monthStart}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  openModal(`${mhead(esc(title))}<div class="stack">${monthList(upcomingMonthItems())}</div>`);
};

function calendarView() {
  const compact = widgetSize('schedule') === 'compact';
  const today = ymdIn(Date.now());
  return `${monthNav('calendar')}
    <div class="schedule-color-key" aria-label="Calendar item types"><span><i style="background:${itemColor('event')}"></i>Events</span><span><i style="background:${itemColor('chore')}"></i>Chores</span></div><div class="mgrid mhead">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="mgrid home-month">${monthDays(monthStart).map((day) => {
      const items = D.items.filter((item) => item.ymd === day);
      return `<button class="day2 ${day.slice(0, 7) !== monthStart.slice(0, 7) ? 'out' : ''} ${day === today ? 'today' : ''}" data-action="home-day" data-day="${day}" aria-label="${esc(dayLabel(day))}, ${items.length} items" ${day === today ? 'aria-current="date"' : ''}>
        <span class="dn">${Number(day.slice(8))}</span>${compact ? `<span class="home-day-dots" aria-hidden="true">${items.slice(0, 3).map((item) => `<i style="background:${itemColor(item.kind)}"></i>`).join('')}</span>` : `${items.slice(0, 3).map((item) => `<span class="home-calendar-item ${item.completed ? 'completed' : ''}" style="--ev:${itemColor(item.kind)}"><span>${timeFmt(item.at)} · ${esc(item.label)}</span><b>${esc(item.name)}</b>${item.approval?.total ? `<span class="home-calendar-approval">${item.approval.label} · ${item.approval.approved}/${item.approval.total}</span>` : ''}</span>`).join('')}
        ${items.length > 3 ? `<span class="home-more">+${items.length - 3} more</span>` : ''}<span class="home-mobile-count" aria-hidden="true">${items.length || ''}</span>` }</button>`;
    }).join('')}</div>${compact ? compactUpcoming() : ''}`;
}

function compactUpcoming() {
  const monthItems = D.items.filter((item) => item.ymd.slice(0, 7) === monthStart.slice(0, 7) && !item.completed && Date.parse(item.at) >= Date.now());
  return `<div class="home-compact-upcoming"><h3>Coming up</h3>${monthItems.slice(0, layoutMode === 'equal' ? 2 : 1).map((item) => `<div><span class="hint">${esc(dayLabel(item.ymd))}</span>${row(item)}</div>`).join('') || '<p class="hint">Nothing else coming up this month.</p>'}${monthItems.length > (layoutMode === 'equal' ? 2 : 1) ? '<button class="btn s" data-action="home-month-list">View all upcoming</button>' : ''}</div>`;
}

export async function homeView() {
  const [{ members }, { events }, chores, balances, { notes }] = await Promise.all([
    api(`/households/${hid()}/members`), api(`/households/${hid()}/events`), api(`/households/${hid()}/chores`), api(`/households/${hid()}/balances`), api(`/households/${hid()}/board`),
  ]);
  D = { householdId: hid(), members, events, chores, balances, notes, user: S.user, timezone: tz(), items: scheduleItems(events, chores, tz()) };
  if (monthHousehold !== hid()) { monthStart = null; monthHousehold = hid(); homeBoardArchive = false; }
  monthStart ??= `${ymdIn(Date.now()).slice(0, 7)}-01`;
  if (editingKey !== layoutKey()) { editing = false; editingKey = layoutKey(); }
  layoutMode = getPreset();
  layout = getLayout();
  const view = getView();
  const widgets = {
    board: `<section class="card stack home-board" id="home-board" data-home-board-root>${householdBoard({ ...D, compact: widgetSize('board') === 'compact', archive: homeBoardArchive, limit: 3 })}</section>`,
    schedule: `<section class="card stack home-schedule" aria-label="Shared household schedule"><div class="${view === 'list' ? 'stack' : ''}" id="home-schedule-content" data-view="${view}">${view === 'calendar' ? calendarView() : listView()}</div></section>`,
    finances: homeFinances({ ...D, compact: widgetSize('finances') === 'compact' }),
  };
  return `${phead('Shared household schedule', 'Here you can see an overview of what’s happening in your household', `<button class="btn s" data-action="home-edit-layout">${editing ? 'Done' : 'Edit dashboard'}</button>`)}
    <div class="home-layout-status sr-only" role="status"></div>${presetChoices()}<div class="page-content home-dashboard" data-preset="${layoutMode}">${layout.map(({ id, size }) => `<div class="home-widget ${size}" data-widget="${id}" data-editing="${editing}">${widgets[id]}</div>`).join('')}</div>`;

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
  fitHomeWidgets(document.querySelector('.home-dashboard'));
  if (keepFocus) content.querySelector('[data-input=home-view]')?.focus();
};
actions['home-month'] = (el) => {
  const d = new Date(`${monthStart}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + Number(el.dataset.n)); monthStart = `${d.toISOString().slice(0, 7)}-01`;
  const content = document.getElementById('home-schedule-content');
  content.innerHTML = content.dataset.view === 'calendar' ? calendarView() : listView();
  fitHomeWidgets(document.querySelector('.home-dashboard'));
};
actions['home-day'] = (el) => {
  const items = D.items.filter((item) => item.ymd === el.dataset.day);
  openModal(`${mhead(esc(dayLabel(el.dataset.day)))}<div class="stack">${items.length ? items.map(row).join('') : '<p class="mute">No events or chores on this day.</p>'}</div><div class="acts"><button class="btn p" data-action="home-create" data-kind="event" data-day="${esc(el.dataset.day)}">Add event</button><button class="btn" data-action="home-create" data-kind="chore" data-day="${esc(el.dataset.day)}">Add chore</button></div>`);
};
actions['home-create'] = (button) => {
  if (!D || D.householdId !== hid() || !queueCalendarCreate(button.dataset.kind, button.dataset.day)) return;
  closeModal();
  location.hash = button.dataset.kind === 'event' ? '#/calendar' : '#/chores';
};
actions['home-open'] = (el) => {
  closeModal();
  if (el.dataset.kind === 'event') {
    try { sessionStorage.setItem('roomie.open', JSON.stringify({ type: 'event', id: Number(el.dataset.id) })); } catch { /* The Events page still opens. */ }
  }
  location.hash = el.getAttribute('href');
};

function paintHomeBoards() {
  for (const board of document.querySelectorAll('[data-home-board-root]')) {
    const opened = [...board.querySelectorAll('details[open]')].map((el) => el.dataset.boardEntry);
    const drafts = [...board.querySelectorAll('form')].map((form) => ({ kind: form.dataset.form, id: form.dataset.id, message: form.elements.namedItem('messageText')?.value ?? '', eventId: form.elements.namedItem('eventId')?.value ?? '' }));
    const full = board.id === 'home-board-all';
    board.innerHTML = householdBoard({ ...D, compact: !full && widgetSize('board') === 'compact', archive: homeBoardArchive, limit: full ? Infinity : 3 });
    board.querySelectorAll('details').forEach((el) => { el.open = opened.includes(el.dataset.boardEntry); });
    for (const form of board.querySelectorAll('form')) {
      const draft = drafts.find((d) => d.kind === form.dataset.form && d.id === form.dataset.id);
      if (!draft) continue;
      form.elements.namedItem('messageText').value = draft.message;
      const field = form.elements.namedItem('eventId'); if (field) field.value = draft.eventId;
    }
  }
}
actions['home-board-all'] = () => openModal(`${mhead('Household board')}<div class="stack home-board" id="home-board-all" data-home-board-root>${householdBoard({ ...D, archive: homeBoardArchive })}</div>`);

async function refreshHomeBoard(onlyChanged = false) {
  const householdId = D.householdId;
  const [{ events }, chores, { notes }] = await Promise.all([api(`/households/${householdId}/events`), api(`/households/${householdId}/chores`), api(`/households/${householdId}/board`)]);
  if (hid() !== householdId || !document.getElementById('home-board')) return;
  if (onlyChanged && JSON.stringify([events, chores, notes]) === JSON.stringify([D.events, D.chores, D.notes])) return;
  D = { ...D, events, chores, notes, items: scheduleItems(events, chores, tz()) };
  paintHomeBoards();
  const content = document.getElementById('home-schedule-content');
  if (content) content.innerHTML = content.dataset.view === 'calendar' ? calendarView() : listView();
  fitHomeWidgets(document.querySelector('.home-dashboard'));
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
actions['home-board-filter'] = (button) => {
  homeBoardArchive = button.dataset.archive === 'true';
  renderWidgetSize('board');
};
actions['home-board-resolve'] = async (button) => {
  const article = button.closest('article');
  const buttons = [...article.querySelectorAll('button')];
  article.setAttribute('aria-busy', 'true');
  buttons.forEach((el) => { el.disabled = true; });
  showError(article, '');
  try {
    await api(`/households/${D.householdId}/board/${button.dataset.id}`, { method: 'PATCH', body: { isResolved: button.dataset.resolved === 'true' } });
  } catch (error) {
    showError(article, error.status === 500
      ? 'Could not update this announcement. The board database may need migration 0003 applied.'
      : error.message);
    article.removeAttribute('aria-busy');
    buttons.forEach((el) => { el.disabled = false; });
    return;
  }
  article.removeAttribute('aria-busy');
  buttons.forEach((el) => { el.disabled = false; });
  toast(button.dataset.resolved === 'true' ? 'Announcement moved to resolved messages' : 'Announcement reopened');
  try { await refreshHomeBoard(); } catch { toast('Saved. Refresh Home to see the updated board.'); }
};
function openAnnouncement(draft = {}) {
  openModal(`${mhead('Make announcement')}${announcementForm(D.events)}`);
  const form = document.querySelector('[data-form="home-note-new"]');
  form.elements.messageText.value = draft.message ?? '';
  form.elements.eventId.value = String(draft.eventId ?? '');
}
actions['home-make-announcement'] = () => openAnnouncement();
actions['home-add-linked-event'] = () => {
  const form = document.querySelector('[data-form="home-note-new"]');
  if (!form) return;
  const draft = { message: form.elements.messageText.value, eventId: form.elements.eventId.value };
  const scope = D.householdId, userId = S.user.userId;
  openLinkedEvent(D, (saved) => {
    if (scope !== S.hid || userId !== S.user?.userId) return;
    if (saved) { if (!D.events.some((event) => event.eventId === saved.eventId)) D.events.push(saved); draft.eventId = saved.eventId; }
    openAnnouncement(draft);
  });
};
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
  if (widgetDrag || document.hidden || document.getElementById('root')?.dataset.page !== 'home' || !D || document.getElementById('modal')) return;
  if (document.activeElement?.closest?.('form,input,textarea,select,button') || document.querySelector('#home-board [aria-busy=true]')) return;
  try { await refreshHomeBoard(true); } catch { /* Keep the last snapshot while offline. */ }
}, 15000);

actions['home-chore-detail'] = (button) => openChoreDetails(D.householdId, Number(button.dataset.id));

function saveLayout() {
  try { localStorage.setItem(layoutKey(), JSON.stringify(layout)); localStorage.setItem(presetKey(), layoutMode); }
  catch { toast('Layout changed for this visit. Your browser could not save it.'); }
}
function applyLayout(focusWidget, focusSelector) {
  const grid = document.querySelector('.home-dashboard');
  if (!grid) return;
  for (const { id, size } of layout) {
    const widget = grid.querySelector(`.home-widget[data-widget="${id}"]`);
    widget.className = `home-widget ${size}`;
    delete widget.dataset.column;
    widget.dataset.editing = String(editing);
    grid.appendChild(widget);
  }
  grid.dataset.preset = layoutMode;
  fitHomeWidgets(grid);
  if (focusWidget) grid.querySelector(`.home-widget[data-widget="${focusWidget}"] ${focusSelector}`)?.focus();
}
actions['home-edit-layout'] = (button) => {
  editing = !editing;
  button.textContent = editing ? 'Done' : 'Edit dashboard';
  document.querySelector('.home-layout-status').textContent = '';
  document.querySelector('.home-layout-choices').hidden = !editing;
  applyLayout();
};
function renderWidgetSize(id) {
  if (id === 'schedule') {
    const content = document.getElementById('home-schedule-content');
    content.innerHTML = content.dataset.view === 'calendar' ? calendarView() : listView();
  }
  if (id === 'board') paintHomeBoards();
  if (id === 'finances') document.querySelector('[data-widget=finances] .home-finances').outerHTML = homeFinances({ ...D, compact: widgetSize('finances') === 'compact' });
}
function setLayout(preset, order = layout.map((w) => w.id)) {
  const previous = new Map(layout.map((w) => [w.id, w.size]));
  layoutMode = preset;
  layout = normalizeHomeLayout(order, preset);
  for (const widget of layout) if (previous.get(widget.id) !== widget.size) renderWidgetSize(widget.id);
  applyLayout();
  document.querySelectorAll('[data-layout-preset]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.layoutPreset === preset)));
  if (widgetDrag) widgetDrag.grip = widgetDrag.widget.querySelector('[data-widget-drag]') ?? widgetDrag.grip;
}
actions['home-layout-preset'] = (button) => {
  if (!HOME_PRESETS.includes(button.dataset.layoutPreset)) return;
  setLayout(button.dataset.layoutPreset); saveLayout();
};
actions['home-widget-move'] = (button) => {
  const order = layout.map((w) => w.id), index = order.indexOf(button.dataset.widget), target = index + Number(button.dataset.step);
  if (index < 0 || target < 0 || target >= order.length) return;
  const [id] = order.splice(index, 1); order.splice(target, 0, id);
  setLayout(layoutMode, order); saveLayout();
  document.querySelector(`.home-widget[data-widget="${id}"] [data-widget-drag]`)?.focus();
};
// Pointer events provide one live preview for mouse, pen, and touch.
let widgetDrag = null;
function arrangeWidgets() { applyLayout(); }
function finishWidgetDrag(cancel = false) {
  const drag = widgetDrag;
  if (!drag) return;
  widgetDrag = null;
  cancelAnimationFrame(drag.frame);
  if (cancel) setLayout(drag.originalMode, drag.original.map((w) => w.id));
  else if (drag.active) saveLayout();
  drag.ghost?.remove(); drag.widget.classList.remove('home-widget-dragging');
  document.body.classList.remove('home-is-dragging');
  document.querySelector('.home-layout-choices')?.classList.remove('drag-active');
  drag.grip = drag.widget.querySelector('[data-widget-drag]') ?? drag.grip;
  if (drag.grip.hasPointerCapture?.(drag.pointerId)) drag.grip.releasePointerCapture(drag.pointerId);
  drag.grip.focus({ preventScroll: true });
  const status = document.querySelector('.home-layout-status');
  if (status && drag.active) status.textContent = cancel ? 'Move cancelled.' : `${widgetNames[drag.id]} moved. Layout saved.`;
}
function previewWidgetMove(x, y) {
  const drag = widgetDrag;
  if (!drag?.active || !drag.widget.isConnected) return;
  drag.ghost.style.transform = `translate(${x - drag.offsetX}px, ${y - drag.offsetY}px)`;
  const target = document.elementFromPoint(x, y);
  const preset = target?.closest('[data-layout-preset]')?.dataset.layoutPreset;
  const tile = target?.closest('.home-widget');
  if (HOME_PRESETS.includes(preset) && (preset !== layoutMode || preset !== 'equal' && layout[0].id !== drag.id)) {
    const order = [drag.id, ...layout.filter((w) => w.id !== drag.id).map((w) => w.id)];
    setLayout(preset, order);
  } else if (tile && tile !== drag.widget && tile.parentElement === drag.widget.parentElement) {
    const order = layout.map((w) => w.id), from = order.indexOf(drag.id), to = order.indexOf(tile.dataset.widget);
    if (from >= 0 && to >= 0) { [order[from], order[to]] = [order[to], order[from]]; setLayout(layoutMode, order); }
  }
  if (drag.ghost.dataset.presentation !== `${layoutMode}:${widgetSize(drag.id)}`) {
    drag.ghost.innerHTML = drag.widget.innerHTML;
    drag.ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    drag.ghost.dataset.presentation = `${layoutMode}:${widgetSize(drag.id)}`;
  }
  drag.ghost.classList.toggle('compact', widgetSize(drag.id) === 'compact');
  drag.ghost.classList.toggle('expanded', widgetSize(drag.id) === 'expanded');
  drag.ghost.style.width = `${drag.widget.getBoundingClientRect().width}px`;
  drag.grip.setPointerCapture?.(drag.pointerId);
}
document.addEventListener('pointerdown', (event) => {
  const grip = event.target.closest?.('[data-widget-drag]');
  if (!editing || !grip || event.button !== 0 || widgetDrag || document.querySelector('#home-board [aria-busy=true]')) return;
  const widget = grip.closest('.home-widget'), rect = widget.getBoundingClientRect();
  widgetDrag = { id: grip.dataset.widgetDrag, grip, widget, pointerId: event.pointerId, original: layout.map((w) => ({ ...w })), originalMode: layoutMode, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, active: false };
  grip.setPointerCapture?.(event.pointerId);
});
document.addEventListener('pointermove', (event) => {
  const drag = widgetDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.x = event.clientX; drag.y = event.clientY;
  if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
  if (!drag.active) {
    drag.active = true;
    const rect = drag.widget.getBoundingClientRect();
    drag.ghost = drag.widget.cloneNode(true);
    drag.ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    drag.ghost.className = `home-widget ${widgetSize(drag.id)} home-widget-ghost`;
    drag.ghost.setAttribute('aria-hidden', 'true'); drag.ghost.inert = true;
    drag.ghost.style.width = `${rect.width}px`;
    document.body.appendChild(drag.ghost);
    drag.widget.classList.add('home-widget-dragging');
    document.body.classList.add('home-is-dragging');
    document.querySelector('.home-layout-choices')?.classList.add('drag-active');
    const scroll = () => {
      if (widgetDrag !== drag || !drag.widget.isConnected) { if (widgetDrag === drag) finishWidgetDrag(true); return; }
      const speed = drag.y < 70 ? -12 : drag.y > window.innerHeight - 70 ? 12 : 0;
      if (speed) { window.scrollBy(0, speed); previewWidgetMove(drag.x, drag.y); }
      drag.frame = requestAnimationFrame(scroll);
    };
    drag.frame = requestAnimationFrame(scroll);
  }
  event.preventDefault(); previewWidgetMove(drag.x, drag.y);
}, { passive: false });
document.addEventListener('pointerup', (event) => { if (event.pointerId === widgetDrag?.pointerId) finishWidgetDrag(); });
document.addEventListener('pointercancel', () => finishWidgetDrag(true));
window.addEventListener('blur', () => finishWidgetDrag(true));
window.addEventListener('hashchange', () => finishWidgetDrag(true));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && widgetDrag) { event.preventDefault(); finishWidgetDrag(true); return; }
  const grip = event.target.closest?.('[data-widget-drag]');
  if (widgetDrag || !editing || !grip || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  actions['home-widget-move']({ dataset: { widget: grip.dataset.widgetDrag, step: ['ArrowUp', 'ArrowLeft'].includes(event.key) ? '-1' : '1' } });
  document.querySelector(`.home-widget[data-widget="${grip.dataset.widgetDrag}"] [data-widget-drag]`)?.focus();
  document.querySelector('.home-layout-status').textContent = `${widgetNames[grip.dataset.widgetDrag]} moved. Layout saved.`;
});

actions['home-open-finances'] = () => { prepareFinanceActivity('payment'); location.hash = '#/finances'; };

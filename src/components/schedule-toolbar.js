import { esc, ico } from '../lib/dom.js';

// All schedules use the same two rows, regardless of card width or page.
export function scheduleToolbar({ title, monthAction, viewInput, view, calendarValue = 'calendar', filters = '', navigationUnit = 'month' }) {
  return `<div class="home-schedule-toolbar"><div class="month-nav"><button class="btn s" data-action="${monthAction}" data-n="-1" aria-label="Previous ${navigationUnit}">‹</button><div class="row"><h2>${esc(title)}</h2></div><button class="btn s" data-action="${monthAction}" data-n="1" aria-label="Next ${navigationUnit}">›</button></div><div class="schedule-display-controls"><select class="input home-view-select" data-input="${viewInput}" aria-label="Schedule view"><option value="${calendarValue}" ${view === calendarValue ? 'selected' : ''}>Calendar view</option><option value="list" ${view === 'list' ? 'selected' : ''}>List view</option></select>${filters ? `<details class="schedule-filter-menu"><summary class="btn s schedule-filter-trigger" aria-label="Filter options" title="Filter options">${ico('settings', 20)}</summary><div class="schedule-filter-panel">${filters}</div></details>` : ''}</div></div>`;
}


// Native disclosure controls support touch and keyboard without a second settings page.
document.addEventListener('click', (event) => {
  for (const menu of document.querySelectorAll('.schedule-filter-menu[open]')) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = document.querySelector('.schedule-filter-menu[open]');
  if (!menu) return;
  event.preventDefault(); menu.open = false; menu.querySelector('summary').focus();
});

export function filterChoices(label, input, options, current) {
  return `<fieldset class="schedule-filter-group"><legend>${esc(label)}</legend>${options.map(([value, text]) => `<label><input type="radio" name="${input}" data-input="${input}" value="${esc(value)}" ${String(current) === String(value) ? 'checked' : ''}><span>${esc(text)}</span></label>`).join('')}</fieldset>`;
}

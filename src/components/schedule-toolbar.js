import { esc } from '../lib/dom.js';

// All schedules use the same two rows, regardless of card width or page.
export function scheduleToolbar({ title, monthAction, viewInput, view, calendarValue = 'calendar', filters = '' }) {
  return `<div class="home-schedule-toolbar"><div class="month-nav"><button class="btn s" data-action="${monthAction}" data-n="-1" aria-label="Previous month">‹</button><div class="row"><h2>${esc(title)}</h2></div><button class="btn s" data-action="${monthAction}" data-n="1" aria-label="Next month">›</button></div><div class="schedule-display-controls"><select class="input home-view-select" data-input="${viewInput}" aria-label="Schedule view"><option value="${calendarValue}" ${view === calendarValue ? 'selected' : ''}>Calendar view</option><option value="list" ${view === 'list' ? 'selected' : ''}>List view</option></select>${filters}</div></div>`;
}

import { esc, itemColor } from '../lib/dom.js';
import { monthDays } from '../../shared/home-schedule.ts';

// Feature calendars share one grid and entry format. Day details retain every item.
export function monthCalendar({ month, today, items, action, dayLabel }) {
  return `<div class="mgrid mhead schedule-calendar-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => `<span>${day}</span>`).join('')}</div><div class="mgrid schedule-month-grid">${monthDays(month).map((day) => {
    const due = items.filter((item) => item.day === day);
    return `<button class="day2 ${day.slice(0,7) !== month.slice(0,7) ? 'out' : ''} ${day === today ? 'today' : ''}" data-action="${action}" data-day="${day}" aria-label="${esc(dayLabel(day))}, ${due.length} items${due.length ? `: ${esc(due.slice(0,3).map((item) => item.title).join(', '))}` : ''}" ${day === today ? 'aria-current="date"' : ''}><span class="dn">${Number(day.slice(8))}</span>${due.slice(0,2).map((item) => `<span class="schedule-calendar-item ${item.completed ? 'completed' : ''}" style="--ev:${itemColor(item.kind)}" title="${esc(`${item.title} · ${item.time} · ${item.person}${item.status ? ` · ${item.status}` : ''}`)}"><span class="calendar-meta">${esc(item.time)} · ${esc(item.person)}</span><b>${esc(item.title)}</b>${item.status ? `<span class="calendar-status">${esc(item.status)}</span>` : ''}</span>`).join('')}${due.length > 2 ? `<span class="schedule-calendar-more">+${due.length-2} more</span>` : ''}<span class="calendar-day-dots" aria-hidden="true">${due.slice(0,3).map((item) => `<i style="background:${itemColor(item.kind)}"></i>`).join('')}${due.length > 3 ? `<small>+${due.length-3}</small>` : ''}</span></button>`;
  }).join('')}</div>`;
}

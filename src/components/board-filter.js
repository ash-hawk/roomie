import './schedule-toolbar.js';
import { ico } from '../lib/dom.js';
export function boardFilter(archive, action) {
  return `<details class="schedule-filter-menu board-filter-menu"><summary class="btn s schedule-filter-trigger" aria-label="Filter messages" title="Filter messages">${ico('settings', 20)}</summary><div class="schedule-filter-panel"><div class="stack home-board-filters" role="group" aria-label="Message status"><button type="button" class="btn s ${archive ? '' : 'p'}" data-action="${action}" data-archive="false" aria-pressed="${!archive}">Current messages</button><button type="button" class="btn s ${archive ? 'p' : ''}" data-action="${action}" data-archive="true" aria-pressed="${archive}">Past messages</button></div></div></details>`;
}

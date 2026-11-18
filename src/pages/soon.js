import { empty, phead } from '../lib/dom.js';

const COPY = {
  home: ['Your house', 'Home', 'A one-glance snapshot of your week.', 'Home snapshot', 'The home snapshot is built last, once calendar, chores and notifications are live.'],
  calendar: ['Household plans', 'Events', 'Meetings, hosting and other plans for your house.', 'Events and board', 'Events, hosting checks and sticky notes are the third slice.'],
  finances: ['Shared money', 'Finances', 'Keep every shared cost clear and accounted for.', 'The expense tracker', 'Purchases, splits, balances and the wish list are being built now.'],
  chores: ['Shared responsibilities', 'Chores', 'Whose turn it is, and when.', 'Chore chart', 'Chores, rotation and swap requests are the second slice.'],
};
export function soonView(name) {
  const [, title, sub, what, why] = COPY[name];
  return `${phead(title, sub)}<section class="card">${empty('🛠️', `${what} is coming next`, why, '<a class="btn p" href="#/finances">Open Finances</a>')}</section>`;
}

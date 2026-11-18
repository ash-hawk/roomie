import { S, household } from './state.js';
import { actions } from './events.js';

let pending = null;
export function validCalendarDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
export function queueCalendarCreate(kind, day) {
  if (!['event', 'chore'].includes(kind) || !validCalendarDay(day)) return false;
  pending = { kind, day, userId: S.user.userId, householdId: household().householdId };
  return true;
}
// Consume only after the destination has loaded its household data and rendered.
export function openPendingCalendarCreate(page) {
  const next = pending;
  if (!next) return false;
  pending = null;
  if (next.userId !== S.user?.userId || next.householdId !== household()?.householdId || page !== (next.kind === 'event' ? 'calendar' : 'chores')) return false;
  actions[next.kind === 'event' ? 'add-event' : 'add-chore']({ dataset: { day: next.day } });
  return true;
}

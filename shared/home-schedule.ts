import { approvalState } from './event-approval.js';
import { addDays } from './chore-dates.js';

type Event = { eventId: number; eventName: string; eventDate: string; createdByUserId: number; category: string; otherLabel?: string | null; location?: string | null; tags?: { response: string | null }[] };
type Chore = { choreId: number; choreName: string };
type Assignment = { assignmentId: number; choreId: number; dueAt: string; assignedUserId: number; isCompleted: boolean };
export type ScheduleItem = { key: string; kind: 'event' | 'chore'; at: string; ymd: string; name: string; userId: number; label: string; location?: string | null; completed: boolean; approval?: ReturnType<typeof approvalState>; eventId?: number };

/** One household-wide dataset for both Home views, dated in the household timezone. */
export function scheduleItems(events: Event[], chores: { chores: Chore[]; assignments: Assignment[] }, timezone: string): ScheduleItem[] {
  const day = (at: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(at));
  const rules = new Map(chores.chores.map((c) => [c.choreId, c]));
  return [
    ...events.map((e): ScheduleItem => ({ key: `event-${e.eventId}`, kind: 'event', at: e.eventDate, ymd: day(e.eventDate), name: e.eventName, userId: e.createdByUserId,
      label: e.category === 'meeting' ? 'Meeting' : e.category === 'hosting' ? 'Hosting' : e.otherLabel || 'Other', location: e.location, approval: approvalState(e.tags ?? []), completed: false, eventId: e.eventId })),
    ...chores.assignments.flatMap((a): ScheduleItem[] => {
      const chore = rules.get(a.choreId);
      return chore ? [{ key: `chore-${a.assignmentId}`, kind: 'chore', at: a.dueAt, ymd: day(a.dueAt), name: chore.choreName, userId: a.assignedUserId, label: 'Chore', completed: a.isCompleted }] : [];
    }),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key));
}

/** A full Sunday–Saturday month grid, with enough rows for every day (including six-week months). */
export function monthDays(month: string): string[] {
  const start = addDays(month, -new Date(`${month}T12:00:00Z`).getUTCDay());
  const next = new Date(`${month}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  const count = Math.ceil((Math.round((Date.parse(last) - Date.parse(start)) / 86400000) + 1) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

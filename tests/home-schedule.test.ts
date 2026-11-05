import { describe, expect, it } from 'vitest';
import { monthDays, scheduleItems } from '../shared/home-schedule.js';

const event = { eventId: 1, eventName: 'House dinner', eventDate: '2026-11-06T02:00:00Z', createdByUserId: 1, category: 'hosting' };
const chores = {
  chores: [{ choreId: 2, choreName: 'Kitchen reset' }],
  assignments: [
    { assignmentId: 3, choreId: 2, dueAt: '2026-11-06T01:00:00Z', assignedUserId: 2, isCompleted: false },
    { assignmentId: 4, choreId: 2, dueAt: '2026-11-06T03:00:00Z', assignedUserId: 1, isCompleted: true },
    { assignmentId: 5, choreId: 999, dueAt: '2026-11-06T00:00:00Z', assignedUserId: 1, isCompleted: false },
  ],
};

describe('combined household schedule', () => {
  it('interleaves events and every roommate’s chore occurrences, including completed work', () => {
    const items = scheduleItems([event], chores, 'America/Denver');
    expect(items.map((i) => [i.kind, i.userId, i.completed])).toEqual([['chore', 2, false], ['event', 1, false], ['chore', 1, true]]);
    expect(items.map((i) => i.ymd)).toEqual(['2026-11-05', '2026-11-05', '2026-11-05']);
    expect(new Set(items.map((i) => i.key)).size).toBe(3);
  });
  it('keeps household-local dates across midnight and the daylight saving fallback', () => {
    const events = ['2026-11-01T05:30:00Z', '2026-11-01T07:30:00Z', '2026-11-01T08:30:00Z'].map((eventDate, i) => ({ ...event, eventId: i, eventDate }));
    expect(scheduleItems(events, { chores: [], assignments: [] }, 'America/Denver').map((i) => i.ymd)).toEqual(['2026-10-31', '2026-11-01', '2026-11-01']);
  });
  it('retains custom event labels and accepts an empty household', () => {
    expect(scheduleItems([{ ...event, category: 'other', otherLabel: 'Maintenance' }], { chores: [], assignments: [] }, 'UTC')[0]?.label).toBe('Maintenance');
    expect(scheduleItems([], { chores: [], assignments: [] }, 'UTC')).toEqual([]);
  });
});

describe('month grid', () => {
  it('includes the final day of a six-week month and its surrounding dates', () => {
    const days = monthDays('2026-05-01');
    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2026-04-26');
    expect(days.at(-1)).toBe('2026-06-06');
    expect(days).toContain('2026-05-31');
  });
  it('handles February and year boundaries in whole weeks', () => {
    expect(monthDays('2026-02-01')).toHaveLength(28);
    expect(monthDays('2028-02-01')).toContain('2028-02-29');
    expect(monthDays('2026-12-01').at(-1)).toBe('2027-01-02');
  });
});

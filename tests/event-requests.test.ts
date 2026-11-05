import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '../api/_lib/auth.js';
const mocks = vi.hoisted(() => ({ selectRows: [] as unknown[][], writes: [] as { table: unknown; values: unknown }[], updated: null as unknown, active: [1, 2, 3] }));
vi.mock('../api/_lib/db.js', async (original) => {
  const real = await original<typeof import('../api/_lib/db.js')>();
  const chain = (rows: unknown[]) => ({ from() { return this; }, where() { return this; }, for() { return this; }, then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(resolve(rows)); } });
  const tx = {
    select: () => chain(mocks.selectRows.shift() ?? []),
    insert: (table: unknown) => ({ values(values: unknown) { mocks.writes.push({ table, values }); return { returning: async () => [mocks.updated], then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(resolve([])) }; } }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [mocks.updated] }) }) }),
    delete: (table: unknown) => ({ where: async () => { mocks.writes.push({ table, values: 'deleted' }); } }),
  };
  return { ...real, db: { ...tx, transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } };
});
vi.mock('../api/_lib/validate.js', async (original) => {
  const real = await original<typeof import('../api/_lib/validate.js')>();
  return { ...real, firstName: async () => 'Alex', householdTz: async () => 'America/Denver', activeIds: async () => mocks.active };
});
vi.mock('../api/_lib/household.js', async (original) => {
  const real = await original<typeof import('../api/_lib/household.js')>();
  return { ...real, assertActiveMembers: async (_tx: unknown, _hid: number, ids: number[]) => { if (ids.some((id) => !mocks.active.includes(id))) throw new Error('Inactive roommate'); } };
});
import { createEvent, updateEvent } from '../api/_lib/calendar.js';
import { schema } from '../api/_lib/db.js';
const actor = { userId: 1 } as CurrentUser;
const body = { eventName: 'Dinner', date: '2026-11-05', time: '18:00', category: 'meeting', taggedUserIds: [1, 2] };
const event = { eventId: 1, createdByUserId: 1, householdId: 1, eventName: 'Dinner', eventDate: '2026-11-06T01:00:00Z', endDate: null, location: null, category: 'meeting', color: null, description: null, reminderMinutesBefore: null };
beforeEach(() => { mocks.selectRows = []; mocks.writes = []; mocks.updated = event; mocks.active = [1, 2, 3]; });

describe('approval persistence', () => {
  it.each(['meeting', 'hosting', 'other'])('requests approval for %s and excludes the creator', async (category) => {
    mocks.selectRows = [[{ eventId: 1, userId: 2, response: 'pending', respondedDate: null }]];
    const saved = await createEvent(actor, 1, { ...body, category, otherLabel: category === 'other' ? 'Maintenance' : undefined });
    expect(mocks.writes.find((w) => w.table === schema.eventTag)?.values).toEqual([{ eventId: 1, userId: 2, response: 'pending' }]);
    expect(saved.tags).toHaveLength(1);
    expect(JSON.stringify(mocks.writes.find((w) => w.table === schema.notification)?.values)).toContain('pending approval');
  });
  it('rejects inactive approvers before writing an event', async () => {
    await expect(createEvent(actor, 1, { ...body, taggedUserIds: [99] })).rejects.toThrow('Inactive roommate');
    expect(mocks.writes).toHaveLength(0);
  });
  it('preserves approvals on an unchanged save', async () => {
    mocks.selectRows = [[event], [{ eventId: 1, userId: 2, response: 'accepted' }], []];
    await updateEvent(actor, 1, 1, body);
    expect(mocks.writes.filter((w) => w.table === schema.eventTag || w.table === schema.notification)).toHaveLength(0);
  });
  it('requests fresh approvals when the plan changes', async () => {
    mocks.selectRows = [[event], [{ eventId: 1, userId: 2, response: 'accepted' }], []];
    mocks.updated = { ...event, eventName: 'Dinner with guests' };
    await updateEvent(actor, 1, 1, { ...body, eventName: 'Dinner with guests' });
    expect(mocks.writes.filter((w) => w.table === schema.eventTag).map((w) => w.values)).toEqual(['deleted', [{ eventId: 1, userId: 2, response: 'pending' }]]);
  });
  it('rejects edits by someone other than the creator', async () => {
    mocks.selectRows = [[{ ...event, createdByUserId: 2 }]];
    await expect(updateEvent(actor, 1, 1, body)).rejects.toThrow();
    expect(mocks.writes).toHaveLength(0);
  });
});

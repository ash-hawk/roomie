import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '../api/_lib/auth.js';
const mock = vi.hoisted(() => ({ rows: [] as unknown[][], writes: [] as { table: unknown; values: Record<string, unknown>; params: unknown[]; kind: string }[] }));
vi.mock('../api/_lib/db.js', async (original) => {
  const real = await original<typeof import('../api/_lib/db.js')>();
  const { PgDialect } = await import('drizzle-orm/pg-core'); const dialect = new PgDialect();
  const chain = (rows: unknown[]) => ({ from() { return this; }, innerJoin() { return this; }, where() { return this; }, for() { return this; }, orderBy() { return this; }, limit() { return this; }, then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(resolve(rows)); } });
  const tx = {
    select: () => chain(mock.rows.shift() ?? []),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async (condition: Parameters<typeof dialect.sqlToQuery>[0]) => { mock.writes.push({ table, values, params: dialect.sqlToQuery(condition).params, kind: 'update' }); return []; } }) }),
    insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { mock.writes.push({ table, values, params: [], kind: 'insert' }); return []; } }),
  };
  return { ...real, db: { ...tx, transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } };
});
vi.mock('../api/_lib/validate.js', async (original) => {
  const real = await original<typeof import('../api/_lib/validate.js')>();
  return { ...real, firstName: async () => 'Alex', activeIds: async () => [2, 9] };
});
vi.mock('../api/_lib/household.js', async (original) => {
  const real = await original<typeof import('../api/_lib/household.js')>();
  return { ...real, assertActiveMembers: async () => undefined };
});
import { schema } from '../api/_lib/db.js';
import { respondToEvent } from '../api/_lib/calendar.js';
import { respondToSwap } from '../api/_lib/chores.js';
import { listNotifications } from '../api/_lib/notifications.js';
const actor = { userId: 9 } as CurrentUser;
const event = { eventId: 9, householdId: 42, createdByUserId: 2, eventName: 'Dinner', eventDate: '2026-11-13T18:00:00Z', endDate: null, category: 'hosting' };
const assignment = { assignmentId: 10, assignedUserId: 2, choreId: 5, choreName: 'Laundry', dueAt: '2026-11-16T14:00:00Z', isCompleted: false, repeats: 'weekly' };
const request = { swapId: 7, type: 'skip', requesterAssignmentId: 10, targetAssignmentId: null, status: 'pending' };
beforeEach(() => { mock.rows = []; mock.writes = []; });

describe('responding clears original notifications in the same transaction', () => {
  it.each(['accepted', 'declined'])('marks the caller’s event invitation read when %s from any UI', async (response) => {
    mock.rows = [[event], [{ eventId: 9, userId: 9, response: 'pending' }], [{ eventId: 9, userId: 9, response, respondedDate: null }]];
    await respondToEvent(actor, 42, 9, { response });
    const read = mock.writes.find((w) => w.table === schema.notification && w.kind === 'update');
    expect(read?.values).toEqual({ isRead: true });
    expect(read?.params).toEqual(expect.arrayContaining([9, 42, 'event', 'calendar_board', 2]));
    expect(mock.writes.at(-1)?.kind).toBe('insert'); // Keep the creator's new outcome notice unread.
  });
  it('also clears the inbox on an idempotent repeat response without sending another outcome', async () => {
    mock.rows = [[event], [{ eventId: 9, userId: 9, response: 'accepted' }], []];
    await respondToEvent(actor, 42, 9, { response: 'accepted' });
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]?.values).toEqual({ isRead: true });
  });
  it('does not mark anyone’s notices read if the caller was not asked', async () => {
    mock.rows = [[event], []];
    await expect(respondToEvent(actor, 42, 9, { response: 'accepted' })).rejects.toThrow('not asked');
    expect(mock.writes).toHaveLength(0);
  });
  it('marks a personal cover decline read without closing the request for others', async () => {
    mock.rows = [[request], [assignment]];
    const result = await respondToSwap(actor, 42, 7, { action: 'decline' });
    expect(result).toMatchObject({ status: 'pending', dismissed: true });
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]?.table).toBe(schema.notification);
    expect(mock.writes[0]?.params).toEqual(expect.arrayContaining([9, 42, 'chore_swap_request', 7]));
  });
  it('clears all old cover invitations before sending the requester’s outcome update', async () => {
    mock.rows = [[request], [assignment]];
    await respondToSwap(actor, 42, 7, { action: 'accept' });
    const noticeWrites = mock.writes.filter((w) => w.table === schema.notification);
    expect(noticeWrites.map((w) => w.kind)).toEqual(['update', 'insert']);
    expect(noticeWrites[0]?.values).toEqual({ isRead: true });
    expect(noticeWrites[0]?.params).toEqual(expect.arrayContaining([42, 'chore_swap_request', 7]));
  });
  it('filters already-answered legacy questions out of inbox rows and unread counts', async () => {
    const old = { notificationId: 1, householdId: 42, sourceType: 'event', sourceId: 9, actorUserId: 2, section: 'calendar_board', isRead: false, createdAt: '2026-11-05T18:00:00Z' };
    mock.rows = [[old, { ...old, notificationId: 2, sourceType: null, sourceId: null, message: 'Another update' }], [{ id: 9, creator: 2 }], [{ id: 9, response: 'accepted' }]];
    const result = await listNotifications(9);
    expect(result.notifications.map((n) => n.notificationId)).toEqual([2]);
    expect(result.unread).toBe(1);
  });
});

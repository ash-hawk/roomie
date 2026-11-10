import { and, eq } from 'drizzle-orm';
import { withHousehold } from '../context.js';
import { db, schema as s } from '../db.js';
import { body, json } from '../http.js';

const KINDS = ['event_hosting', 'event_other', 'approval_request'] as const;

async function readSettings(userId: number, householdId: number) {
  const rows = await db.select({ kind: s.notificationSetting.kind, enabled: s.notificationSetting.enabled }).from(s.notificationSetting)
    .where(and(eq(s.notificationSetting.userId, userId), eq(s.notificationSetting.householdId, householdId), eq(s.notificationSetting.channel, 'email')));
  return Object.fromEntries(KINDS.map((kind) => [kind, rows.some((row) => row.kind === kind && row.enabled)]));
}

export const GET = withHousehold(async ({ user, householdId }) => json({ settings: await readSettings(user.userId, householdId) }));

export const PUT = withHousehold(async ({ user, householdId, req }) => {
  const value = await body(req), input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  await db.transaction(async (tx) => {
    await tx.delete(s.notificationSetting).where(and(eq(s.notificationSetting.userId, user.userId), eq(s.notificationSetting.householdId, householdId), eq(s.notificationSetting.channel, 'email')));
    const enabled = KINDS.filter((kind) => input[kind] === true);
    if (enabled.length) await tx.insert(s.notificationSetting).values(enabled.map((kind) => ({ userId: user.userId, householdId, channel: 'email', kind, enabled: true })));
  });
  return json({ settings: await readSettings(user.userId, householdId) });
});

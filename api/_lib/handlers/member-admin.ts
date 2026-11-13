import { cleanupDepartingMember } from '../member-cleanup.js';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { withHousehold } from '../context.js';
import { assertOwner } from '../household.js';
import { HttpError, id, json, segments } from '../http.js';

const hm = schema.householdMember;

export const PATCH = withHousehold(async ({ user, householdId, role, req }) => {
  assertOwner(role);
  const targetUserId = id(segments(req)[3], 'member id');
  if (targetUserId === user.userId) throw new HttpError(400, 'Choose another roommate to receive ownership');

  await db.transaction(async (tx) => {
    await tx.select({ householdId: schema.household.householdId }).from(schema.household)
      .where(eq(schema.household.householdId, householdId)).for('update');
    const [owner] = await tx.select().from(hm)
      .where(and(eq(hm.householdId, householdId), eq(hm.userId, user.userId), isNull(hm.leftDate))).for('update');
    if (!owner || owner.role !== 'owner') throw new HttpError(403, 'Only a household owner can do that');
    const [target] = await tx.select().from(hm)
      .where(and(eq(hm.householdId, householdId), eq(hm.userId, targetUserId), isNull(hm.leftDate))).for('update');
    if (!target) throw new HttpError(404, 'Active roommate not found');

    await tx.update(hm).set({ role: 'owner' }).where(eq(hm.memberId, target.memberId));
    await tx.update(hm).set({ role: 'member' }).where(eq(hm.memberId, owner.memberId));
  });
  return json({ transferred: true });
});

export const DELETE = withHousehold(async ({ user, householdId, role, req }) => {
  const targetUserId = id(segments(req)[3], 'member id');
  const leaving = targetUserId === user.userId;
  if (!leaving) assertOwner(role);

  const removed = await db.transaction(async (tx) => {
    await tx.select({ householdId: schema.household.householdId }).from(schema.household)
      .where(eq(schema.household.householdId, householdId)).for('update');
    const [owner] = await tx.select().from(hm)
      .where(and(eq(hm.householdId, householdId), eq(hm.userId, user.userId), isNull(hm.leftDate))).for('update');
    if (!owner || (!leaving && owner.role !== 'owner')) throw new HttpError(403, 'Only a household owner can remove another roommate');
    const [target] = await tx.select().from(hm)
      .where(and(eq(hm.householdId, householdId), eq(hm.userId, targetUserId), isNull(hm.leftDate))).for('update');
    if (!target) throw new HttpError(404, 'Active roommate not found');
    if (target.role === 'owner') throw new HttpError(400, 'Transfer ownership before leaving. If you are the last member, delete the household instead.');
    const [row] = await tx.update(hm).set({ leftDate: new Date().toISOString() })
      .where(eq(hm.memberId, target.memberId)).returning({ userId: hm.userId });
    await cleanupDepartingMember(tx, householdId, targetUserId);
    return row;
  });
  if (!removed) throw new HttpError(404, 'Active roommate not found');
  return json({ removed: removed.userId });
});

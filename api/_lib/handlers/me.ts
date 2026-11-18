import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { withUser } from '../context.js';
import { body, json } from '../http.js';
import { parseProfileUpdate } from '../profile.js';

const userFields = {
  userId: schema.users.userId, firstName: schema.users.firstName, lastName: schema.users.lastName,
  email: schema.users.email, phoneNumber: schema.users.phoneNumber, profilePhoto: schema.users.profilePhoto,
};

async function methodsFor(userId: number) {
  return db.select({ app: schema.paymentMethod.app, username: schema.paymentMethod.username, isPreferred: schema.paymentMethod.isPreferred })
    .from(schema.paymentMethod).where(eq(schema.paymentMethod.userId, userId));
}

// First call after sign-in: requireUser creates the users row if this is a new person.
export const GET = withUser(async (user) => {
  const [me] = await db.select(userFields).from(schema.users).where(eq(schema.users.userId, user.userId));
  const households = await db.select({
    householdId: schema.household.householdId, householdName: schema.household.householdName,
    timezone: schema.household.timezone, themeColor: schema.household.themeColor,
    joinCode: schema.household.joinCode, address: schema.household.address, role: schema.householdMember.role,
    onboardedAt: schema.householdMember.onboardedAt,
  }).from(schema.householdMember)
    .innerJoin(schema.household, eq(schema.household.householdId, schema.householdMember.householdId))
    .where(and(eq(schema.householdMember.userId, user.userId), isNull(schema.householdMember.leftDate)));
  const visibleHouseholds = households.map(({ joinCode, ...household }) =>
    household.role === 'owner' ? { ...household, joinCode } : household);
  return json({ user: { ...me, paymentMethods: await methodsFor(user.userId) }, households: visibleHouseholds });
});

export const PATCH = withUser(async (user, req) => {
  const update = parseProfileUpdate(await body(req));
  const saved = await db.transaction(async (tx) => {
    const [me] = await tx.update(schema.users).set({
      firstName: update.firstName, lastName: update.lastName,
      phoneNumber: update.phoneNumber, profilePhoto: update.profilePhoto,
    }).where(eq(schema.users.userId, user.userId)).returning(userFields);
    await tx.delete(schema.paymentMethod).where(eq(schema.paymentMethod.userId, user.userId));
    if (update.paymentMethods.length) await tx.insert(schema.paymentMethod).values(update.paymentMethods.map((m) => ({ ...m, userId: user.userId })));
    return me!;
  });
  return json({ user: { ...saved, paymentMethods: await methodsFor(user.userId) } });
});

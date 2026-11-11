import { eq } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { withHousehold } from '../context.js';
import { assertOwner } from '../household.js';
import { HttpError, json } from '../http.js';
import { newJoinCode } from '../joincode.js';

export const POST = withHousehold(async ({ householdId, role }) => {
  assertOwner(role);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [saved] = await db.update(schema.household).set({ joinCode: newJoinCode() })
        .where(eq(schema.household.householdId, householdId)).returning({ joinCode: schema.household.joinCode });
      if (!saved) throw new HttpError(404, 'Household not found');
      return json(saved);
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      if (e.code === '23505' && String(e.constraint).includes('join_code')) continue;
      throw error;
    }
  }
  throw new HttpError(500, 'Could not create a unique join code. Try again.');
});

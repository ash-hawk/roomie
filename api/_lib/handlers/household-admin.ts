import { eq } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { withHousehold } from '../context.js';
import { assertOwner } from '../household.js';
import { body, HttpError, json } from '../http.js';

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validZone = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

export const PATCH = withHousehold(async ({ householdId, role, req }) => {
  assertOwner(role);
  const b = await body(req);
  const householdName = text(b.householdName, 80);
  const address = text(b.address, 200);
  const timezone = text(b.timezone, 60);
  const themeColor = text(b.themeColor, 20);
  if (!householdName) throw new HttpError(400, 'Household name is required');
  if (!timezone || !validZone(timezone)) throw new HttpError(400, 'Unknown timezone');
  if (themeColor && !/^#[0-9a-f]{6}$/i.test(themeColor)) throw new HttpError(400, 'Theme color must be a six-digit hex color');

  const [saved] = await db.update(schema.household).set({
    householdName, address: address || null, timezone, ...(b.themeColor !== undefined ? { themeColor: themeColor || null } : {}),
  }).where(eq(schema.household.householdId, householdId))
    .returning({ householdId: schema.household.householdId, householdName: schema.household.householdName, address: schema.household.address, timezone: schema.household.timezone, themeColor: schema.household.themeColor });
  if (!saved) throw new HttpError(404, 'Household not found');
  return json({ household: saved });
});

export const DELETE = withHousehold(async ({ householdId, role }) => {
  assertOwner(role);
  const [deleted] = await db.delete(schema.household).where(eq(schema.household.householdId, householdId))
    .returning({ householdId: schema.household.householdId });
  if (!deleted) throw new HttpError(404, 'Household not found');
  return json({ deleted: true });
});

import { and, asc, eq, isNull } from 'drizzle-orm';
import type { CurrentUser } from './auth.js';
import { callTool } from './ai.js';
import { db, schema as s } from './db.js';
import { HttpError } from './http.js';
import { taggedJson } from '../../shared/ai.js';
import { onboardingTemplate } from '../../shared/onboarding-templates.js';
import { validateOnboardingDraft, type OnboardingAnswers, type OnboardingMember } from '../../shared/onboarding.js';

const CHORES = new Set(['trash', 'dishes', 'bathroom', 'vacuuming', 'kitchen', 'recycling']);
const text = (value: unknown, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function parseOnboardingAnswers(value: unknown): OnboardingAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Setup answers must be an object');
  const input = value as Record<string, unknown>;
  const chores = Array.isArray(input.chores) ? [...new Set(input.chores.filter((item): item is string => typeof item === 'string' && CHORES.has(item)))] : [];
  if (!chores.length) throw new HttpError(400, 'Choose at least one chore');
  const cleanLevel = input.cleanLevel === 'relaxed' || input.cleanLevel === 'high' ? input.cleanLevel : input.cleanLevel === 'balanced' ? 'balanced' : null;
  if (!cleanLevel) throw new HttpError(400, 'Choose how clean shared spaces should be');
  return { chores, cleanLevel, quietHours: text(input.quietHours), guestPolicy: text(input.guestPolicy), sharedSupplies: text(input.sharedSupplies) };
}

const draftSchema = {
  type: 'object', additionalProperties: false, required: ['chores', 'rulesNote', 'wishlist'], properties: {
    chores: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['name', 'description', 'repeats', 'dueTime', 'effort', 'assigneeNames'], properties: {
      name: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 500 }, repeats: { type: 'string', enum: ['weekly', 'monthly', 'once'] },
      dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 }, dayOfMonth: { type: 'integer', minimum: 1, maximum: 31 }, date: { type: 'string' },
      dueTime: { type: 'string' }, effort: { type: 'string', enum: ['easy', 'medium', 'hard'] }, assigneeNames: { type: 'array', minItems: 1, items: { type: 'string' } },
    } } },
    rulesNote: { type: 'string', maxLength: 500 },
    wishlist: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['name', 'needOrWant', 'description'], properties: {
      name: { type: 'string', maxLength: 120 }, needOrWant: { type: 'string', enum: ['need', 'want'] }, description: { type: 'string', maxLength: 500 },
    } } },
  },
};

export async function suggestOnboarding(user: CurrentUser, householdId: number, role: string, value: unknown) {
  const answers = parseOnboardingAnswers(value);
  const existing = await db.select({ id: s.chore.choreId }).from(s.chore).where(eq(s.chore.householdId, householdId)).limit(1);
  if (role !== 'owner' && existing.length) throw new HttpError(403, 'This household is already set up');
  const rows = await db.select({ userId: s.users.userId, firstName: s.users.firstName, timezone: s.household.timezone })
    .from(s.householdMember).innerJoin(s.users, eq(s.users.userId, s.householdMember.userId)).innerJoin(s.household, eq(s.household.householdId, s.householdMember.householdId))
    .where(and(eq(s.householdMember.householdId, householdId), isNull(s.householdMember.leftDate))).orderBy(asc(s.householdMember.memberId));
  const members: OnboardingMember[] = rows.map((row) => ({ userId: row.userId, firstName: row.firstName }));
  const fallback = () => ({ source: 'template' as const, ...validateOnboardingDraft(onboardingTemplate(answers, members), members) });
  const result = await callTool<Record<string, unknown>>({
    feature: 'onboarding', userId: user.userId, householdId, toolName: 'draft_house_setup',
    toolDescription: 'Draft editable starter chores, one concise house-rules note, and shared-supply wishlist items.', schema: draftSchema,
    prompt: {
      system: 'You draft a practical starter setup for roommates. Use only the supplied first names. Never invent people or ids. Keep the tone friendly and specific. Return the draft only through the required tool.',
      user: taggedJson('house-setup', { answers, members: members.map((member) => member.firstName), timezone: rows[0]?.timezone ?? 'America/Denver' }),
    },
  });
  if (result.status !== 'ok' || !result.value) return fallback();
  const draft = validateOnboardingDraft(result.value, members);
  return draft.chores.length ? { source: 'ai' as const, ...draft } : fallback();
}

export async function completeOnboarding(userId: number, householdId: number) {
  const [row] = await db.update(s.householdMember).set({ onboardedAt: new Date().toISOString() })
    .where(and(eq(s.householdMember.userId, userId), eq(s.householdMember.householdId, householdId), isNull(s.householdMember.leftDate)))
    .returning({ onboardedAt: s.householdMember.onboardedAt });
  if (!row) throw new HttpError(404, 'Household not found');
  return row;
}

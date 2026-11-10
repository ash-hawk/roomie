import { cleanAiData } from './ai.js';

export type OnboardingAnswers = {
  chores: string[];
  cleanLevel: 'relaxed' | 'balanced' | 'high';
  quietHours: string;
  guestPolicy: string;
  sharedSupplies: string;
};

export type OnboardingMember = { userId: number; firstName: string };

export type OnboardingChore = {
  choreName: string;
  description: string | null;
  repeats: 'none' | 'weekly' | 'monthly';
  date?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  dueTime: string;
  effort: 'easy' | 'medium' | 'hard';
  assignment: { mode: 'person'; userId: number } | { mode: 'rotate'; userIds: number[] };
};

export type OnboardingDraft = {
  chores: OnboardingChore[];
  rulesNote: string;
  wishlist: { itemName: string; needOrWant: 'need' | 'want'; description: string | null }[];
};

const ymd = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value ? value : null;
const text = (value: unknown, max: number) => cleanAiData(value, max);

/** Project untrusted model output onto fields accepted by the existing write endpoints. */
export function validateOnboardingDraft(raw: unknown, members: OnboardingMember[]): OnboardingDraft {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const byName = new Map<string, OnboardingMember[]>();
  for (const member of members) {
    const key = member.firstName.trim().toLocaleLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), member]);
  }
  const chores: OnboardingChore[] = [];
  for (const item of Array.isArray(input.chores) ? input.chores : []) {
    if (chores.length >= 10 || !item || typeof item !== 'object' || Array.isArray(item)) continue;
    const c = item as Record<string, unknown>;
    const choreName = text(c.name ?? c.choreName, 120);
    const dueTime = typeof c.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.dueTime) ? c.dueTime : null;
    const rawRepeats = c.repeats === 'once' ? 'none' : c.repeats;
    if (!choreName || !dueTime || !['none', 'weekly', 'monthly'].includes(String(rawRepeats))) continue;
    const repeats = rawRepeats as OnboardingChore['repeats'];
    const names = Array.isArray(c.assigneeNames) ? c.assigneeNames : [];
    const groups = names.map((name) => typeof name === 'string' ? byName.get(name.trim().toLocaleLowerCase()) : undefined);
    if (!names.length || groups.some((group) => !group?.length)) continue;
    const assignees = [...new Set(groups.flatMap((group) => group!.map((member) => member.userId)))];
    if (!assignees.length || (repeats === 'none' && assignees.length !== 1)) continue;
    const effort: OnboardingChore['effort'] = c.effort === 'easy' || c.effort === 'hard' ? c.effort : 'medium';
    const base = {
      choreName,
      description: text(c.description, 500) || null,
      repeats,
      dueTime,
      effort,
      assignment: assignees.length === 1
        ? { mode: 'person' as const, userId: assignees[0]! }
        : { mode: 'rotate' as const, userIds: assignees },
    };
    if (repeats === 'weekly') {
      const day = Number(c.dayOfWeek); if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      chores.push({ ...base, repeats, dayOfWeek: day });
    } else if (repeats === 'monthly') {
      const day = Number(c.dayOfMonth); if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      chores.push({ ...base, repeats, dayOfMonth: day });
    } else {
      const date = ymd(c.date); if (!date) continue;
      chores.push({ ...base, repeats, date });
    }
  }
  const wishlist: OnboardingDraft['wishlist'] = [];
  for (const item of Array.isArray(input.wishlist) ? input.wishlist : []) {
    if (wishlist.length >= 10 || !item || typeof item !== 'object' || Array.isArray(item)) continue;
    const w = item as Record<string, unknown>, itemName = text(w.name ?? w.itemName, 120);
    if (!itemName) continue;
    wishlist.push({ itemName, needOrWant: w.needOrWant === 'want' ? 'want' : 'need', description: text(w.description, 500) || null });
  }
  return { chores, rulesNote: text(input.rulesNote, 500), wishlist };
}

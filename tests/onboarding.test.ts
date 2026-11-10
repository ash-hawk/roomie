import { describe, expect, it } from 'vitest';
import { onboardingTemplate } from '../shared/onboarding-templates.js';
import { validateOnboardingDraft, type OnboardingAnswers } from '../shared/onboarding.js';

const members = [{ userId: 7, firstName: 'Alex' }, { userId: 9, firstName: 'Priya' }];
const chore = (over: Record<string, unknown> = {}) => ({
  name: 'Take out trash', description: 'Kitchen and bathroom bins', repeats: 'weekly', dayOfWeek: 1,
  dueTime: '19:00', effort: 'easy', assigneeNames: ['Alex', 'Priya'], ...over,
});

describe('onboarding draft validation', () => {
  it('drops invalid days and unknown roommates', () => {
    expect(validateOnboardingDraft({ chores: [chore({ dayOfWeek: 8 })] }, members).chores).toEqual([]);
    expect(validateOnboardingDraft({ chores: [chore({ assigneeNames: ['Alex', 'Made Up Person'] })] }, members).chores).toEqual([]);
  });
  it('caps a large model reply at ten chores', () => {
    const result = validateOnboardingDraft({ chores: Array.from({ length: 40 }, (_, i) => chore({ name: `Chore ${i}` })) }, members);
    expect(result.chores).toHaveLength(10);
  });
  it('caps names and maps names to ids while ignoring model-supplied ids and extra fields', () => {
    const result = validateOnboardingDraft({ chores: [chore({ name: 'x'.repeat(300), userId: 123456, secret: 'ignore me' })] }, members).chores[0]!;
    expect(result.choreName).toHaveLength(120);
    expect(result.assignment).toEqual({ mode: 'rotate', userIds: [7, 9] });
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('secret');
  });
  it('requires one known assignee for a one-time chore', () => {
    expect(validateOnboardingDraft({ chores: [chore({ repeats: 'once', date: '2027-01-02' })] }, members).chores).toEqual([]);
    expect(validateOnboardingDraft({ chores: [chore({ repeats: 'once', date: '2027-01-02', assigneeNames: ['Alex'] })] }, members).chores[0]).toMatchObject({ repeats: 'none', date: '2027-01-02', assignment: { mode: 'person', userId: 7 } });
  });
});

describe('onboarding template fallback', () => {
  it('creates an editable setup without AI', () => {
    const answers: OnboardingAnswers = { chores: ['trash', 'bathroom'], cleanLevel: 'balanced', quietHours: '11 PM to 7 AM', guestPolicy: 'Give a heads-up', sharedSupplies: 'Dish soap, paper towels' };
    const result = validateOnboardingDraft(onboardingTemplate(answers, members), members);
    expect(result.chores.map((item) => item.choreName)).toEqual(['Take out trash', 'Clean bathroom']);
    expect(result.rulesNote).toContain('Quiet hours');
    expect(result.wishlist.map((item) => item.itemName)).toEqual(['Dish soap', 'paper towels']);
  });
});


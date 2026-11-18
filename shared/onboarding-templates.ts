import type { OnboardingAnswers, OnboardingMember } from './onboarding.js';

const STARTERS: Record<string, { name: string; description: string; dayOfWeek: number; dueTime: string; effort: 'easy' | 'medium' | 'hard' }> = {
  trash: { name: 'Take out trash', description: 'Empty household bins and take them to the curb.', dayOfWeek: 1, dueTime: '19:00', effort: 'easy' },
  dishes: { name: 'Kitchen reset', description: 'Load dishes, wipe counters, and leave the sink clear.', dayOfWeek: 3, dueTime: '20:00', effort: 'medium' },
  bathroom: { name: 'Clean bathroom', description: 'Clean the sink, mirror, toilet, and shower.', dayOfWeek: 6, dueTime: '11:00', effort: 'hard' },
  vacuuming: { name: 'Vacuum shared spaces', description: 'Vacuum the living room, halls, and entry.', dayOfWeek: 6, dueTime: '12:00', effort: 'medium' },
  kitchen: { name: 'Kitchen wipe-down', description: 'Wipe appliances, counters, table, and cabinet handles.', dayOfWeek: 4, dueTime: '19:00', effort: 'medium' },
  recycling: { name: 'Take out recycling', description: 'Empty recycling and take it to the collection point.', dayOfWeek: 1, dueTime: '19:15', effort: 'easy' },
};

export function onboardingTemplate(answers: OnboardingAnswers, members: OnboardingMember[]) {
  const assigneeNames = members.map((member) => member.firstName);
  const chores = answers.chores.flatMap((key) => {
    const item = STARTERS[key];
    return item ? [{ ...item, repeats: 'weekly', assigneeNames }] : [];
  });
  const clean = answers.cleanLevel === 'high' ? 'We reset shared spaces after using them and do a thorough clean each week.'
    : answers.cleanLevel === 'relaxed' ? 'We keep shared spaces usable and speak up kindly when something needs attention.'
      : 'We tidy shared spaces as we go and do a weekly reset.';
  const details = [answers.quietHours && `Quiet hours: ${answers.quietHours}.`, answers.guestPolicy && `Guests: ${answers.guestPolicy}.`].filter(Boolean).join(' ');
  const wishlist = answers.sharedSupplies.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 8)
    .map((name) => ({ name, needOrWant: 'need', description: 'Shared household supply' }));
  return { chores, rulesNote: `${clean}${details ? ` ${details}` : ''}`, wishlist };
}

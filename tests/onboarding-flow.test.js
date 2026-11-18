// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/auth-client.js', () => ({ api: vi.fn() }));
import { api } from '../src/auth-client.js';
import { forms } from '../src/lib/events.js';
import { S } from '../src/lib/state.js';
import { onboardingView } from '../src/pages/onboarding.js';

const method = { app: 'venmo', username: '@alex', isPreferred: true };
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  sessionStorage.clear();
  S.user = { userId: 1, firstName: 'Alex', lastName: 'Rivera', phoneNumber: '8015550100', profilePhoto: null, paymentMethods: [method] };
  S.households = [{ householdId: 2, role: 'owner', timezone: 'America/Denver' }];
  S.hid = 2;
});

async function renderStep(step) {
  if (step !== undefined) sessionStorage.setItem('roomie.onboarding.step', String(step));
  document.body.innerHTML = await onboardingView();
  return document.querySelector('main form');
}

it('introduces Roomie and saves contact information and payment preferences separately', async () => {
  await renderStep();
  expect(document.querySelector('main h1').textContent).toBe('Welcome to Roomie');
  let form = await renderStep(1);
  expect(form.elements.namedItem('pay_venmo')).toBeNull();
  form.elements.namedItem('firstName').value = 'Sam';
  const user = { ...S.user, firstName: 'Sam' };
  vi.mocked(api).mockResolvedValue({ user });
  await forms['onboarding-profile'](form);
  expect(api).toHaveBeenLastCalledWith('/me', expect.objectContaining({ body: expect.objectContaining({ firstName: 'Sam', paymentMethods: [method] }) }));
  form = await renderStep();
  expect(form.elements.namedItem('firstName')).toBeNull();
  expect(document.querySelector('main').textContent).toContain('Roomie does not charge you');
  form.elements.namedItem('pay_venmo').value = '';
  await forms['onboarding-payment'](form);
  expect(api).toHaveBeenLastCalledWith('/me', expect.objectContaining({ body: expect.objectContaining({ firstName: 'Sam', phoneNumber: '8015550100', paymentMethods: [] }) }));
});

it('lets a roommate review and save a custom chore without requesting AI', async () => {
  const form = await renderStep(3);
  form.elements.namedItem('customChores').value = 'Water the plants';
  await forms['onboarding-suggest'](form, { submitter: form.querySelector('[value="manual"]') });
  expect(api).not.toHaveBeenCalled();
  const review = await renderStep();
  expect(review.elements.namedItem('choreName_0').value).toBe('Water the plants');
  vi.mocked(api).mockResolvedValue({});
  await forms['onboarding-confirm'](review);
  expect(api).toHaveBeenCalledWith('/households/2/chores', expect.objectContaining({ body: expect.objectContaining({
    choreName: 'Water the plants',
    assignment: { mode: 'person', userId: 1 },
  }) }));
});

it('lets a roommate opt out of every email preference in one action', async () => {
  const enabled = { event_hosting: true, event_other: true, approval_request: true };
  vi.mocked(api).mockResolvedValue({ settings: enabled });
  const form = await renderStep(5);
  expect(form.elements.namedItem('event_hosting').checked).toBe(true);
  await forms['onboarding-notifications'](form, { submitter: form.querySelector('[value="off"]') });
  expect(api).toHaveBeenLastCalledWith('/households/2/notification-settings', {
    method: 'PUT', body: { event_hosting: false, event_other: false, approval_request: false },
  });
});

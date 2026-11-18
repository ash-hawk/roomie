import { describe, expect, it } from 'vitest';
import { S, needsOnboarding } from '../src/lib/state.js';

describe('onboarding routing', () => {
  it('shows onboarding with no household or an incomplete current membership', () => {
    S.hid = null; S.households = [];
    expect(needsOnboarding()).toBe(true);
    S.hid = 4; S.households = [{ householdId: 4, onboardedAt: null }];
    expect(needsOnboarding()).toBe(true);
    S.households = [{ householdId: 4, onboardedAt: '2026-11-06T12:00:00Z' }];
    expect(needsOnboarding()).toBe(false);
  });
});

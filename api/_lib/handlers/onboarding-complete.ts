import { withHousehold } from '../context.js';
import { json } from '../http.js';
import { completeOnboarding } from '../onboarding.js';

export const POST = withHousehold(async ({ user, householdId }) =>
  json(await completeOnboarding(user.userId, householdId)));

import { withHousehold } from '../context.js';
import { body, json } from '../http.js';
import { suggestOnboarding } from '../onboarding.js';

export const POST = withHousehold(async ({ user, householdId, role, req }) =>
  json(await suggestOnboarding(user, householdId, role, await body(req))));

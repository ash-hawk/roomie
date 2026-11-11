import { withHousehold } from '../context.js';
import { body, json } from '../http.js';
import { createEvent, listEvents } from '../calendar.js';
import { runAfterResponse } from '../background.js';
import { deliverOutbox } from '../event-email.js';

export const GET = withHousehold(async ({ user, householdId }) => json(await listEvents(householdId, user.userId)));
export const POST = withHousehold(async ({ user, householdId, req }) => {
  const created = await createEvent(user, householdId, await body(req));
  await runAfterResponse(deliverOutbox({ sourceType: 'event', sourceId: created.eventId }));
  return json(created, 201);
});

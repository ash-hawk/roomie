import { withUser } from '../context.js';
import { body, json } from '../http.js';
import { readNotificationChannel, requestNotificationConfirmation } from '../notification-channel.js';

export const GET = withUser(async (user) => json({ channel: await readNotificationChannel(user.userId) }));

export const POST = withUser(async (user, req) => {
  const input = await body(req);
  return json({ channel: await requestNotificationConfirmation(user.userId, input.destination), confirmationSent: true }, 201);
});

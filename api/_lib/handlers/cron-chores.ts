import { withCron } from '../context.js';
import { json } from '../http.js';
import { generateAll, sendDueReminders } from '../chores.js';
import { sendEventReminders } from '../calendar.js';

// Daily (vercel.json crons): top up recurring chores a few weeks ahead, then send due-soon reminders.
// Event reminders ride along. All are safe to re-run: unique (chore_id, due_at) and last_reminded_at.
export const GET = withCron(async () => {
  const generated = await generateAll();
  const reminders = await sendDueReminders();
  const events = await sendEventReminders();
  return json({ ...generated, ...reminders, ...events });
});

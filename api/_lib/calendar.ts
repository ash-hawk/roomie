// Slice (c): calendar events (with tagged roommates and the "is it OK if I host?" check) and the
// sticky-note board. Rules live here; handlers in handlers/ only call these functions.
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema as s, type Tx } from './db.js';
import type { CurrentUser } from './auth.js';
import { HttpError, id } from './http.js';
import { assertActiveMembers, assertCreator } from './household.js';
import { queueEventEmails, skipEventEmails } from './event-email.js';
import { activeIds, firstName, householdTz, optStr, str } from './validate.js';

const iso = (v: string) => new Date(v).toISOString();
const CATEGORIES = ['hosting', 'meeting', 'other'] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ymd = (v: unknown, label: string) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`)) || new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) !== v) throw new HttpError(400, `${label} must be a date`); return v; };
const hhmm = (v: unknown, label: string) => { if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, `${label} must be a time like 18:30`); return v; };
const whenText = (isoStr: string, tz: string) => new Date(isoStr).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

type EventRow = typeof s.event.$inferSelect;
type TagRow = typeof s.eventTag.$inferSelect;
// Event colors are now derived from the creator. Reuse the legacy nullable color column for the
// custom label on "other" events; old hex values remain harmless and are treated as no label.
const eventOut = (e: EventRow, tags: TagRow[], viewerId: number) => ({
  eventId: e.eventId, eventName: e.eventName, eventDate: iso(e.eventDate), endDate: e.endDate ? iso(e.endDate) : null, location: e.location,
  category: e.category, otherLabel: e.category === 'other' && e.color && !HEX.test(e.color) ? e.color : null,
  reminderMinutesBefore: e.reminderMinutesBefore, description: e.description,
  notifyRoommates: e.notifyRoommates,
  createdByUserId: e.createdByUserId, canEdit: e.createdByUserId === viewerId,
  tags: tags.filter((t) => t.eventId === e.eventId).map((t) => ({ userId: t.userId, response: t.response, respondedDate: t.respondedDate ? iso(t.respondedDate) : null })),
});

async function loadEvent(tx: Tx | typeof db, householdId: number, eventId: number, lock = false) {
  const q = tx.select().from(s.event).where(and(eq(s.event.eventId, eventId), eq(s.event.householdId, householdId)));
  const [e] = lock ? await q.for('update') : await q;
  if (!e) throw new HttpError(404, 'Event not found');
  return e;
}

/** Events from 90 days ago onward; the page filters and sorts. */
export async function listEvents(householdId: number, viewerId: number) {
  const rows = await db.select().from(s.event)
    .where(and(eq(s.event.householdId, householdId), gte(s.event.eventDate, sql`now() - interval '90 days'`))).orderBy(asc(s.event.eventDate));
  const tags = rows.length ? await db.select().from(s.eventTag).where(inArray(s.eventTag.eventId, rows.map((r) => r.eventId))) : [];
  return { events: rows.map((e) => eventOut(e, tags, viewerId)) };
}

function eventFields(b: Record<string, unknown>) {
  const category = b.category === undefined ? 'other' : (CATEGORIES as readonly string[]).includes(b.category as string) ? (b.category as (typeof CATEGORIES)[number]) : (() => { throw new HttpError(400, 'Category must be hosting, meeting or other'); })();
  const otherLabel = category === 'other' ? str(b.otherLabel, 1, 40, 'Other event label') : null;
  let reminder: number | null = null;
  if (b.reminderMinutesBefore != null && b.reminderMinutesBefore !== '') {
    reminder = Number(b.reminderMinutesBefore);
    if (!Number.isInteger(reminder) || reminder < 0 || reminder > 10080) throw new HttpError(400, 'Reminder must be between 0 minutes and 7 days');
  }
  const tagged = b.taggedUserIds === undefined ? [] : Array.isArray(b.taggedUserIds) ? [...new Set(b.taggedUserIds.map((x) => id(x, 'roommate')))] : (() => { throw new HttpError(400, 'Tagged roommates must be a list'); })();
  if (tagged.length > 12) throw new HttpError(400, 'Too many tagged roommates');
  if (b.notifyRoommates !== undefined && typeof b.notifyRoommates !== 'boolean') throw new HttpError(400, 'notifyRoommates must be true or false');
  return {
    eventName: str(b.eventName, 1, 120, 'Event name'), date: ymd(b.date, 'Date'), time: hhmm(b.time, 'Time'),
    endTime: b.endTime == null || b.endTime === '' ? null : hhmm(b.endTime, 'End time'),
    location: optStr(b.location, 120, 'Location'), description: optStr(b.description, 500, 'Description'), category, otherLabel, reminder, tagged,
    notifyRoommates: b.notifyRoommates === true,
  };
}

/** Tag rows + notifications for roommates newly tagged on an event. Selected roommates are asked to approve the event, for every category. */
async function tagRoommates(tx: Tx, householdId: number, e: EventRow, userIds: number[], actor: CurrentUser, tz: string) {
  if (!userIds.length) return;
  await tx.insert(s.eventTag).values(userIds.map((u) => ({ eventId: e.eventId, userId: u, response: 'pending' })));
  const me = await firstName(tx, actor.userId);
  const when = whenText(iso(e.eventDate), tz);
  await tx.insert(s.notification).values(userIds.map((u) => ({ userId: u, householdId, actorUserId: actor.userId, section: 'calendar_board', sourceType: 'event', sourceId: e.eventId,
    message: `${me} is asking for your approval: ${e.eventName} on ${when}. This event is pending approval.` })));
}

export async function createEvent(user: CurrentUser, householdId: number, b: Record<string, unknown>) {
  const f = eventFields(b);
  const tz = await householdTz(db, householdId);
  return db.transaction(async (tx) => {
    const tagged = f.tagged.filter((u) => u !== user.userId);
    await assertActiveMembers(tx, householdId, tagged);
    const start = sql`((${f.date}::date + ${f.time}::time) AT TIME ZONE ${tz})`;
    const end = f.endTime ? sql`((${f.date}::date + ${f.endTime}::time) AT TIME ZONE ${tz})` : null;
    if (end) { const ok = await tx.execute(sql`SELECT ${end} >= ${start} AS ok`); if (!(ok.rows[0] as { ok: boolean }).ok) throw new HttpError(400, 'The event cannot end before it starts'); }
    const [e] = await tx.insert(s.event).values({ householdId, createdByUserId: user.userId, eventName: f.eventName, eventDate: start, endDate: end, location: f.location,
      category: f.category, color: f.otherLabel, reminderMinutesBefore: f.reminder, description: f.description, notifyRoommates: f.notifyRoommates }).returning();
    await tagRoommates(tx, householdId, e!, tagged, user, tz);
    await queueEventEmails(tx, e!, tagged);
    const tags = await tx.select().from(s.eventTag).where(eq(s.eventTag.eventId, e!.eventId));
    return eventOut(e!, tags, user.userId);
  });
}

/** Creator only. Replaces the event's details and tag list; only newly tagged roommates are notified. */
export async function updateEvent(user: CurrentUser, householdId: number, eventId: number, b: Record<string, unknown>) {
  const f = eventFields(b);
  const tz = await householdTz(db, householdId);
  return db.transaction(async (tx) => {
    const old = await loadEvent(tx, householdId, eventId, true);
    assertCreator(old.createdByUserId, user.userId);
    const wanted = f.tagged.filter((u) => u !== user.userId);
    const have = await tx.select().from(s.eventTag).where(eq(s.eventTag.eventId, eventId));
    const added = wanted.filter((u) => !have.some((t) => t.userId === u));
    await assertActiveMembers(tx, householdId, added); // a roommate who moved out can stay on history but is never newly tagged
    const start = sql`((${f.date}::date + ${f.time}::time) AT TIME ZONE ${tz})`;
    const end = f.endTime ? sql`((${f.date}::date + ${f.endTime}::time) AT TIME ZONE ${tz})` : null;
    if (end) { const ok = await tx.execute(sql`SELECT ${end} >= ${start} AS ok`); if (!(ok.rows[0] as { ok: boolean }).ok) throw new HttpError(400, 'The event cannot end before it starts'); }
    const [e] = await tx.update(s.event).set({ eventName: f.eventName, eventDate: start, endDate: end, location: f.location, category: f.category, color: f.otherLabel, reminderMinutesBefore: f.reminder, description: f.description, notifyRoommates: f.notifyRoommates })
      .where(eq(s.event.eventId, eventId)).returning();
    const planChanged = old.eventName !== e!.eventName || iso(old.eventDate) !== iso(e!.eventDate) || (old.endDate ? iso(old.endDate) : null) !== (e!.endDate ? iso(e!.endDate) : null) || old.location !== e!.location || old.category !== e!.category || old.color !== e!.color || old.description !== e!.description;
    const active = await activeIds(tx, householdId);
    const reset = planChanged ? have.filter((t) => wanted.includes(t.userId) && active.includes(t.userId)).map((t) => t.userId) : [];
    const gone = have.filter((t) => !wanted.includes(t.userId) || reset.includes(t.userId)).map((t) => t.userId);
    if (gone.length) await tx.delete(s.eventTag).where(and(eq(s.eventTag.eventId, eventId), inArray(s.eventTag.userId, gone)));
    await tagRoommates(tx, householdId, e!, [...new Set([...added, ...reset])], user, tz);
    const tags = await tx.select().from(s.eventTag).where(eq(s.eventTag.eventId, eventId));
    return eventOut(e!, tags, user.userId);
  });
}

export async function deleteEvent(user: CurrentUser, householdId: number, eventId: number) {
  await db.transaction(async (tx) => {
    const e = await loadEvent(tx, householdId, eventId, true);
    assertCreator(e.createdByUserId, user.userId);
    await skipEventEmails(tx, eventId);
    await tx.delete(s.notification).where(and(eq(s.notification.householdId, householdId), eq(s.notification.sourceType, 'event'), eq(s.notification.sourceId, eventId)));
    await tx.delete(s.event).where(eq(s.event.eventId, eventId)); // tags go with it; board notes that linked it keep their text
  });
}

/** A tagged roommate answers an event approval request. Only the person who was asked can answer, and only for themselves. */
export async function respondToEvent(user: CurrentUser, householdId: number, eventId: number, b: Record<string, unknown>) {
  if (b.response !== 'accepted' && b.response !== 'declined') throw new HttpError(400, 'Answer accepted or declined');
  return db.transaction(async (tx) => {
    const e = await loadEvent(tx, householdId, eventId, true);
    const [tag] = await tx.select().from(s.eventTag).where(and(eq(s.eventTag.eventId, eventId), eq(s.eventTag.userId, user.userId))).for('update');
    if (!tag || tag.response === null) throw new HttpError(400, 'You were not asked about this event');
    // Clear the caller's original approval questions, regardless of where they responded.
    await tx.update(s.notification).set({ isRead: true }).where(and(
      eq(s.notification.userId, user.userId), eq(s.notification.householdId, householdId),
      eq(s.notification.sourceType, 'event'), eq(s.notification.sourceId, eventId), eq(s.notification.section, 'calendar_board'),
      e.createdByUserId === null ? isNull(s.notification.actorUserId) : eq(s.notification.actorUserId, e.createdByUserId),
    ));
    if (tag.response === b.response) {
      const tags = await tx.select().from(s.eventTag).where(eq(s.eventTag.eventId, eventId));
      return eventOut(e, tags, user.userId);
    }
    const now = new Date().toISOString();
    await tx.update(s.eventTag).set({ response: b.response as string, respondedDate: now }).where(and(eq(s.eventTag.eventId, eventId), eq(s.eventTag.userId, user.userId)));
    if (e.createdByUserId && e.createdByUserId !== user.userId && (await activeIds(tx, householdId)).includes(e.createdByUserId)) {
      const me = await firstName(tx, user.userId);
      await tx.insert(s.notification).values({ userId: e.createdByUserId, householdId, actorUserId: user.userId, section: 'calendar_board', sourceType: 'event', sourceId: eventId,
        message: `${me} ${b.response === 'accepted' ? 'is fine with' : 'is not okay with'} ${e.eventName}.` });
    }
    const tags = await tx.select().from(s.eventTag).where(eq(s.eventTag.eventId, eventId));
    return eventOut(e, tags, user.userId);
  });
}

// ---- the sticky-note board ---------------------------------------------------------------------
type MsgRow = typeof s.bulletinMessage.$inferSelect;
const noteOut = (m: MsgRow, viewerId: number) => ({
  messageId: m.messageId, senderUserId: m.senderUserId, eventId: m.eventId, parentMessageId: m.parentMessageId, messageText: m.messageText,
  isPinned: m.isPinned, postedDate: iso(m.postedDate), canEdit: m.senderUserId === viewerId,
});

export async function listBoard(householdId: number, viewerId: number) {
  const rows = await db.select().from(s.bulletinMessage).where(eq(s.bulletinMessage.householdId, householdId)).orderBy(desc(s.bulletinMessage.isPinned), desc(s.bulletinMessage.postedDate));
  const notes = rows.filter((m) => m.parentMessageId === null).map((m) => ({
    ...noteOut(m, viewerId),
    replies: rows.filter((r) => r.parentMessageId === m.messageId).sort((a, b) => Date.parse(iso(a.postedDate)) - Date.parse(iso(b.postedDate))).map((r) => noteOut(r, viewerId)),
  }));
  return { notes };
}

export async function postNote(user: CurrentUser, householdId: number, b: Record<string, unknown>) {
  const text = str(b.messageText, 1, 500, 'Note');
  return db.transaction(async (tx) => {
    let eventId: number | null = null, parent: MsgRow | null = null;
    if (b.eventId != null) { eventId = id(b.eventId, 'event'); await loadEvent(tx, householdId, eventId); }
    if (b.parentMessageId != null) {
      const [p] = await tx.select().from(s.bulletinMessage).where(and(eq(s.bulletinMessage.messageId, id(b.parentMessageId, 'note')), eq(s.bulletinMessage.householdId, householdId)));
      if (!p) throw new HttpError(404, 'Note not found');
      if (p.parentMessageId !== null) throw new HttpError(400, 'Reply to the note itself, not to a reply');
      if (eventId !== null) throw new HttpError(400, 'Only a new note can be linked to an event');
      parent = p;
    }
    const [m] = await tx.insert(s.bulletinMessage).values({ householdId, senderUserId: user.userId, eventId, parentMessageId: parent?.messageId ?? null, messageText: text }).returning();
    if (parent?.senderUserId && parent.senderUserId !== user.userId && (await activeIds(tx, householdId)).includes(parent.senderUserId)) {
      const me = await firstName(tx, user.userId);
      await tx.insert(s.notification).values({ userId: parent.senderUserId, householdId, actorUserId: user.userId, section: 'calendar_board', sourceType: 'bulletin_message', sourceId: m!.messageId, message: `${me} replied to your note.` });
    }
    return noteOut(m!, user.userId);
  });
}

async function ownNote(tx: Tx, householdId: number, messageId: number, userId: number) {
  const [m] = await tx.select().from(s.bulletinMessage).where(and(eq(s.bulletinMessage.messageId, messageId), eq(s.bulletinMessage.householdId, householdId))).for('update');
  if (!m) throw new HttpError(404, 'Note not found');
  if (m.senderUserId !== userId) throw new HttpError(403, 'Only the person who wrote this can change it');
  return m;
}
/** Sender only: edit the text, or pin / unpin a top-level note. */
export async function updateNote(user: CurrentUser, householdId: number, messageId: number, b: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    const m = await ownNote(tx, householdId, messageId, user.userId);
    const set: Partial<typeof s.bulletinMessage.$inferInsert> = {};
    if (b.messageText !== undefined) set.messageText = str(b.messageText, 1, 500, 'Note');
    if (b.isPinned !== undefined) { if (typeof b.isPinned !== 'boolean') throw new HttpError(400, 'isPinned must be true or false'); if (m.parentMessageId !== null) throw new HttpError(400, 'Only a note can be pinned'); set.isPinned = b.isPinned; }
    if (!Object.keys(set).length) return noteOut(m, user.userId);
    const [u] = await tx.update(s.bulletinMessage).set(set).where(eq(s.bulletinMessage.messageId, messageId)).returning();
    return noteOut(u!, user.userId);
  });
}
export async function deleteNote(user: CurrentUser, householdId: number, messageId: number) {
  await db.transaction(async (tx) => {
    await ownNote(tx, householdId, messageId, user.userId);
    const replies = await tx.select({ id: s.bulletinMessage.messageId }).from(s.bulletinMessage).where(eq(s.bulletinMessage.parentMessageId, messageId));
    const ids = [messageId, ...replies.map((r) => r.id)];
    await tx.delete(s.notification).where(and(eq(s.notification.householdId, householdId), eq(s.notification.sourceType, 'bulletin_message'), inArray(s.notification.sourceId, ids)));
    await tx.delete(s.bulletinMessage).where(eq(s.bulletinMessage.messageId, messageId)); // replies cascade
  });
}

// ---- reminders --------------------------------------------------------------------------------
// reminder_minutes_before is stored on the event; the daily cron is the only clock we have (Hobby plan), so an
// event is reminded on the first run at or after (start - lead - 24h): a short lead can arrive up to a day early
// but is never missed. No column tracks it: a 'system' notification pointing at the event, per person, is the
// record, so re-running the job never sends twice. Reminders wait until every tagged roommate has approved;
// once confirmed, the creator and current tagged roommates each get one.
export async function sendEventReminders(opts: { nowIso?: string } = {}) {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  return db.transaction(async (tx) => {
    const due = await tx.execute(sql`
      SELECT e.event_id, e.event_name, e.household_id, h.timezone, r.user_id,
             to_char(e.event_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS starts
      FROM event e
      JOIN household h ON h.household_id = e.household_id
      JOIN LATERAL (
        SELECT e.created_by_user_id AS user_id WHERE e.created_by_user_id IS NOT NULL
        UNION
        SELECT t.user_id FROM event_tag t WHERE t.event_id = e.event_id AND t.response IS DISTINCT FROM 'declined'
      ) r ON true
      JOIN household_member m ON m.household_id = e.household_id AND m.user_id = r.user_id AND m.left_date IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM event_tag vote WHERE vote.event_id = e.event_id AND vote.response IN ('pending', 'declined'))
        AND e.reminder_minutes_before IS NOT NULL AND e.event_date > ${nowIso}::timestamptz
        AND e.event_date - make_interval(mins => e.reminder_minutes_before) <= ${nowIso}::timestamptz + interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM notification n WHERE n.user_id = r.user_id AND n.source_type = 'event' AND n.source_id = e.event_id AND n.section = 'system')
      ORDER BY e.event_id, r.user_id
      FOR UPDATE OF e SKIP LOCKED`);
    const rows = due.rows as { event_id: string; event_name: string; household_id: string; timezone: string; user_id: string; starts: string }[];
    if (rows.length) await tx.insert(s.notification).values(rows.map((r) => ({
      userId: Number(r.user_id), householdId: Number(r.household_id), actorUserId: null, section: 'system' as const, sourceType: 'event' as const, sourceId: Number(r.event_id),
      message: `Reminder: ${r.event_name} is ${whenText(r.starts, r.timezone)}.`,
    })));
    return { eventReminders: rows.length };
  });
}

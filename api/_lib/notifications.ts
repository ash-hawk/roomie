// Slice (d): the notification dashboard. Every function takes the user id from the verified token and
// only ever touches that user's own rows. Households the user has moved out of are hidden entirely.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema as s } from './db.js';
import { HttpError } from './http.js';

import { hideRequestFromInbox } from './notification-inbox.js';

const SECTIONS = ['chores', 'money', 'expense_tracker', 'system', 'calendar_board'] as const;
const iso = (v: string) => new Date(v).toISOString();

/**
 * The caller's latest 100 notifications from households they currently live in, plus what each one
 * points at: does the source still exist, and what is its state (so the page can offer Accept / Decline
 * right on the card). `swapPending` is what drives the red alert in the top bar.
 */
export async function listNotifications(userId: number) {
  const n = s.notification, hm = s.householdMember;
  const rows = await db.select({
    notificationId: n.notificationId, householdId: n.householdId, section: n.section, sourceType: n.sourceType, sourceId: n.sourceId,
    message: n.message, isRead: n.isRead, createdAt: n.createdAt, actorUserId: n.actorUserId,
  }).from(n)
    .innerJoin(hm, and(eq(hm.householdId, n.householdId), eq(hm.userId, n.userId), isNull(hm.leftDate)))
    .where(eq(n.userId, userId)).orderBy(desc(n.createdAt)).limit(500);

  const ids = (type: string) => [...new Set(rows.filter((r) => r.sourceType === type && r.sourceId !== null).map((r) => Number(r.sourceId)))];
  const swapIds = ids('chore_swap_request'), payIds = ids('payment'), eventIds = ids('event');
  const swaps = new Map((swapIds.length ? await db.select({ id: s.choreSwapRequest.swapId, status: s.choreSwapRequest.status }).from(s.choreSwapRequest).where(inArray(s.choreSwapRequest.swapId, swapIds)) : []).map((r) => [Number(r.id), r.status]));
  const payments = new Map((payIds.length ? await db.select({ id: s.payment.paymentId, status: s.payment.status, payee: s.payment.payeeUserId }).from(s.payment).where(inArray(s.payment.paymentId, payIds)) : []).map((p) => [Number(p.id), p]));
  const eventCreators = new Map((eventIds.length ? await db.select({ id: s.event.eventId, creator: s.event.createdByUserId }).from(s.event).where(inArray(s.event.eventId, eventIds)) : []).map((e) => [Number(e.id), e.creator]));
  const myTags = new Map((eventIds.length ? await db.select({ id: s.eventTag.eventId, response: s.eventTag.response }).from(s.eventTag).where(and(eq(s.eventTag.userId, userId), inArray(s.eventTag.eventId, eventIds))) : []).map((t) => [Number(t.id), t.response]));
  // The first notification's actor is the original requester, even after a swap changes assignees.
  const requestNotices = swapIds.length ? await db.select({ id: n.sourceId, actor: n.actorUserId }).from(n)
    .where(and(eq(n.sourceType, 'chore_swap_request'), inArray(n.sourceId, swapIds), inArray(n.householdId, [...new Set(rows.map((r) => r.householdId))])))
    .orderBy(asc(n.notificationId)) : [];
  const requesters = new Map<number, number | null>();
  for (const notice of requestNotices) if (notice.id !== null && !requesters.has(Number(notice.id))) requesters.set(Number(notice.id), notice.actor);
  const present = async (type: string, col: typeof s.choreAssignment.assignmentId | typeof s.expense.expenseId | typeof s.wishlistItem.wishlistItemId | typeof s.bulletinMessage.messageId, table: typeof s.choreAssignment | typeof s.expense | typeof s.wishlistItem | typeof s.bulletinMessage) => {
    const list = ids(type);
    return new Set((list.length ? await db.select({ id: col }).from(table).where(inArray(col, list)) : []).map((r) => Number(r.id)));
  };
  const has: Record<string, Set<number>> = {
    chore_assignment: await present('chore_assignment', s.choreAssignment.assignmentId, s.choreAssignment),
    expense: await present('expense', s.expense.expenseId, s.expense),
    wishlist_item: await present('wishlist_item', s.wishlistItem.wishlistItemId, s.wishlistItem),
    bulletin_message: await present('bulletin_message', s.bulletinMessage.messageId, s.bulletinMessage),
  };

  const visible = rows.filter((r) => {
    const sid = r.sourceId === null ? null : Number(r.sourceId);
    return !hideRequestFromInbox(r, { viewerId: userId, eventCreatorId: sid === null ? undefined : eventCreators.get(sid), eventResponse: sid === null ? undefined : myTags.get(sid), requesterId: sid === null ? undefined : requesters.get(sid), requestStatus: sid === null ? undefined : swaps.get(sid) });
  }).slice(0, 100);
  const out = visible.map((r) => {
    const sid = r.sourceId === null ? null : Number(r.sourceId);
    let sourceGone = false, sourceStatus: string | null = null, canRespond = false;
    if (sid !== null) {
      if (r.sourceType === 'chore_swap_request') { sourceGone = !swaps.has(sid); sourceStatus = swaps.get(sid) ?? null; canRespond = sourceStatus === 'pending'; }
      else if (r.sourceType === 'payment') { const p = payments.get(sid); sourceGone = !p; sourceStatus = p?.status ?? null; canRespond = !!p && p.payee === userId && (p.status === 'sent' || p.status === 'disputed'); }
      else if (r.sourceType === 'event') { sourceGone = !eventCreators.has(sid); sourceStatus = myTags.get(sid) ?? null; canRespond = sourceStatus === 'pending' && r.actorUserId === eventCreators.get(sid); }
      else if (r.sourceType && has[r.sourceType]) sourceGone = !has[r.sourceType]!.has(sid);
    }
    return { ...r, sourceId: sid, createdAt: iso(r.createdAt), sourceGone, sourceStatus, canRespond, swapPending: r.sourceType === 'chore_swap_request' && sourceStatus === 'pending' && !r.isRead };
  });
  return { notifications: out, unread: out.filter((x) => !x.isRead).length, swapPending: out.filter((x) => x.swapPending).length };
}

/** Mark all of the caller's notifications read, optionally just one section. */
export async function markAllRead(userId: number, b: Record<string, unknown>) {
  const n = s.notification;
  if (b.section !== undefined && !(SECTIONS as readonly string[]).includes(b.section as string)) throw new HttpError(400, 'Unknown section');
  const where = b.section ? and(eq(n.userId, userId), eq(n.isRead, false), eq(n.section, b.section as string)) : and(eq(n.userId, userId), eq(n.isRead, false));
  const done = await db.update(n).set({ isRead: true }).where(where).returning({ id: n.notificationId });
  return { marked: done.length };
}

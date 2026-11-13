import { sql } from 'drizzle-orm';
import type { Tx } from './db.js';

/** Called only after locking and verifying a self-departure or owner removal. */
export async function cleanupDepartingMember(tx: Pick<Tx, 'execute'>, householdId: number, userId: number) {
  // Close outstanding requests before deleting occurrences; completed work is retained, including work completed early.
  await tx.execute(sql`
    UPDATE notification n SET is_read = true
    WHERE n.household_id = ${householdId} AND n.source_type = 'chore_swap_request'
      AND n.source_id IN (
        SELECT r.swap_id FROM chore_swap_request r
        JOIN chore_assignment a ON a.assignment_id = r.requester_assignment_id
        JOIN chore c ON c.chore_id = a.chore_id
        LEFT JOIN chore_assignment t ON t.assignment_id = r.target_assignment_id
        WHERE c.household_id = ${householdId} AND r.status = 'pending'
          AND (a.assigned_user_id = ${userId} OR t.assigned_user_id = ${userId}))`);
  await tx.execute(sql`
    UPDATE chore_swap_request r SET status = 'declined', responded_date = now()
    FROM chore_assignment a JOIN chore c ON c.chore_id = a.chore_id
    WHERE r.requester_assignment_id = a.assignment_id AND c.household_id = ${householdId}
      AND r.status = 'pending' AND (a.assigned_user_id = ${userId} OR EXISTS (
        SELECT 1 FROM chore_assignment t WHERE t.assignment_id = r.target_assignment_id AND t.assigned_user_id = ${userId}))`);
  await tx.execute(sql`
    UPDATE notification n SET is_read = true
    WHERE n.household_id = ${householdId} AND n.source_type = 'chore_assignment' AND n.source_id IN (
      SELECT a.assignment_id FROM chore_assignment a JOIN chore c ON c.chore_id = a.chore_id
      WHERE c.household_id = ${householdId} AND a.assigned_user_id = ${userId}
        AND NOT a.is_completed)`);
  await tx.execute(sql`
    DELETE FROM chore_assignment a USING chore c
    WHERE a.chore_id = c.chore_id AND c.household_id = ${householdId}
      AND a.assigned_user_id = ${userId} AND NOT a.is_completed`);
  // Empty rotations stop generating; shared rotations continue with the remaining roommates.
  await tx.execute(sql`
    DELETE FROM chore_rotation r USING chore c
    WHERE r.chore_id = c.chore_id AND c.household_id = ${householdId} AND r.user_id = ${userId}`);
  // Shared rules continue, with an active owner able to manage them.
  await tx.execute(sql`
    UPDATE chore c SET created_by_user_id = m.user_id
    FROM household_member m
    WHERE c.household_id = ${householdId} AND c.created_by_user_id = ${userId}
      AND m.household_id = c.household_id AND m.role = 'owner' AND m.left_date IS NULL
      AND EXISTS (SELECT 1 FROM chore_rotation r JOIN household_member a
        ON a.user_id = r.user_id AND a.household_id = c.household_id AND a.left_date IS NULL
        WHERE r.chore_id = c.chore_id)`);
  // Archive whole announcement threads so replies from other roommates are preserved.
  await tx.execute(sql`
    UPDATE bulletin_message SET is_resolved = true, is_pinned = false
    WHERE household_id = ${householdId} AND sender_user_id = ${userId} AND parent_message_id IS NULL`);
  await tx.execute(sql`
    UPDATE notification n SET is_read = true
    WHERE n.household_id = ${householdId} AND (
      (n.actor_user_id = ${userId} AND n.section IN ('money', 'expense_tracker')) OR
      (n.source_type = 'payment' AND n.source_id IN (SELECT payment_id FROM payment
        WHERE household_id = ${householdId} AND (payer_user_id = ${userId} OR payee_user_id = ${userId}))) OR
      (n.source_type = 'bulletin_message' AND n.source_id IN (SELECT message_id FROM bulletin_message
        WHERE household_id = ${householdId} AND sender_user_id = ${userId})))`);
  await tx.execute(sql`
    UPDATE email_outbox SET status = 'skipped', last_error = 'Roommate moved out'
    WHERE household_id = ${householdId} AND status IN ('pending', 'failed')
      AND (user_id = ${userId} OR (source_type = 'event' AND source_id IN (
        SELECT event_id FROM event WHERE household_id = ${householdId}
          AND created_by_user_id = ${userId} AND event_date >= now())))`);
  await tx.execute(sql`
    UPDATE notification SET is_read = true
    WHERE household_id = ${householdId} AND (user_id = ${userId} OR (source_type = 'event' AND source_id IN (
      SELECT event_id FROM event WHERE household_id = ${householdId}
        AND created_by_user_id = ${userId} AND event_date >= now())))`);
  await tx.execute(sql`
    DELETE FROM event_tag t USING event e
    WHERE t.event_id = e.event_id AND e.household_id = ${householdId}
      AND e.event_date >= now() AND t.user_id = ${userId}`);
  await tx.execute(sql`
    DELETE FROM event WHERE household_id = ${householdId} AND created_by_user_id = ${userId}
      AND event_date >= now()`);
}

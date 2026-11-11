import { sql } from 'drizzle-orm';
import type { Tx } from './db.js';

/** Called only after locking and verifying the active owner and departing membership. */
export async function removeFutureMemberActivity(tx: Pick<Tx, 'execute'>, householdId: number, userId: number) {
  // Close outstanding requests before deleting occurrences; historical completed work is retained.
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
        AND NOT a.is_completed AND a.due_at >= now())`);
  await tx.execute(sql`
    DELETE FROM chore_assignment a USING chore c
    WHERE a.chore_id = c.chore_id AND c.household_id = ${householdId}
      AND a.assigned_user_id = ${userId} AND NOT a.is_completed AND a.due_at >= now()`);
  // Empty rotations stop generating; shared rotations continue with the remaining roommates.
  await tx.execute(sql`
    DELETE FROM chore_rotation r USING chore c
    WHERE r.chore_id = c.chore_id AND c.household_id = ${householdId} AND r.user_id = ${userId}`);
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

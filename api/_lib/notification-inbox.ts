type Notification = { sourceType: string | null; section: string; actorUserId: number | null; isRead: boolean };
type Context = { viewerId: number; eventCreatorId?: number | null; eventResponse?: string | null; requesterId?: number | null; requestStatus?: string | null };

/** Dismiss the original question, while keeping separate outcome updates for the person who asked. */
export function hideRequestFromInbox(n: Notification, context: Context): boolean {
  if (n.sourceType === 'event' && n.section === 'calendar_board'
    && context.eventCreatorId !== undefined && n.actorUserId === context.eventCreatorId
    && context.eventResponse != null) {
    return n.isRead || context.eventResponse === 'accepted' || context.eventResponse === 'declined';
  }
  if (n.sourceType === 'chore_swap_request' && context.requesterId !== undefined
    && context.viewerId !== context.requesterId && n.actorUserId === context.requesterId) {
    return n.isRead || context.requestStatus === 'accepted' || context.requestStatus === 'declined';
  }
  return false;
}

import { describe, expect, it } from 'vitest';
import { hideRequestFromInbox } from '../api/_lib/notification-inbox.js';

const notice = { sourceType: 'event', section: 'calendar_board', actorUserId: 2, isRead: false };
describe('request inbox lifecycle', () => {
  it.each(['accepted', 'declined'])('hides legacy %s approval questions even if their old read flag was never updated', (eventResponse) => {
    expect(hideRequestFromInbox(notice, { viewerId: 9, eventCreatorId: 2, eventResponse })).toBe(true);
  });
  it('keeps a fresh pending approval, but does not resurface old read invitations after a plan edit', () => {
    const context = { viewerId: 9, eventCreatorId: 2, eventResponse: 'pending' };
    expect(hideRequestFromInbox(notice, context)).toBe(false);
    expect(hideRequestFromInbox({ ...notice, isRead: true }, context)).toBe(true);
  });
  it('preserves informational tags, reminders, and the creator’s separate response updates', () => {
    expect(hideRequestFromInbox(notice, { viewerId: 9, eventCreatorId: 2, eventResponse: null })).toBe(false);
    expect(hideRequestFromInbox({ ...notice, section: 'system' }, { viewerId: 9, eventCreatorId: 2, eventResponse: 'accepted' })).toBe(false);
    expect(hideRequestFromInbox({ ...notice, actorUserId: 9 }, { viewerId: 2, eventCreatorId: 2 })).toBe(false);
  });
  it('dismisses resolved cover/swap invitations and personal cover declines while keeping other roommates’ open invitations', () => {
    const request = { ...notice, sourceType: 'chore_swap_request', section: 'chores' };
    expect(hideRequestFromInbox(request, { viewerId: 9, requesterId: 2, requestStatus: 'accepted' })).toBe(true);
    expect(hideRequestFromInbox(request, { viewerId: 9, requesterId: 2, requestStatus: 'declined' })).toBe(true);
    expect(hideRequestFromInbox({ ...request, isRead: true }, { viewerId: 9, requesterId: 2, requestStatus: 'pending' })).toBe(true);
    expect(hideRequestFromInbox(request, { viewerId: 3, requesterId: 2, requestStatus: 'pending' })).toBe(false);
  });
  it('preserves separate outcome notices sent to the original requester', () => {
    expect(hideRequestFromInbox({ ...notice, sourceType: 'chore_swap_request', actorUserId: 9 }, { viewerId: 2, requesterId: 2, requestStatus: 'accepted' })).toBe(false);
  });
});

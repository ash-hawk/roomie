import { describe, expect, it } from 'vitest';
import { currentHouseholdData } from '../src/lib/current-household.js';
const members = [{ userId: 1 }, { userId: 2, leftDate: '2026-11-01' }, { userId: 3 }];
describe('departed roommate display cleanup', () => {
  it('hides departed assignments, requests and empty rules while retaining shared rotations', () => {
    const data = {
      chores: [
        { choreId: 1, createdByUserId: 2, rotation: [2] },
        { choreId: 2, createdByUserId: 2, rotation: [2, 3] },
      ],
      assignments: [{ assignmentId: 1, choreId: 1, assignedUserId: 2 }, { assignmentId: 2, choreId: 2, assignedUserId: 3 }],
      swapRequests: [{ requesterUserId: 2 }, { requesterUserId: 1, targetUserId: 2 }, { requesterUserId: 3, targetUserId: null }],
    };
    const visible = currentHouseholdData(members, data);
    expect(visible.assignments.map(a => a.assignmentId)).toEqual([2]);
    expect(visible.chores).toEqual([{ choreId: 2, createdByUserId: 2, rotation: [3] }]);
    expect(visible.swapRequests).toEqual([{ requesterUserId: 3, targetUserId: null }]);
    expect(data.chores[1].rotation).toEqual([2, 3]);
  });
  it('hides departed authors and replies without exposing their identities in active feeds', () => {
    const visible = currentHouseholdData(members, {
      events: [{ eventId: 1, createdByUserId: 2 }, { eventId: 2, createdByUserId: 1, tags: [{ userId: 2 }, { userId: 3 }] }],
      notes: [{ senderUserId: 2 }, { senderUserId: 1, replies: [{ senderUserId: 2 }, { senderUserId: 3 }] }],
      wish: [{ itemName: 'Old', createdByUserId: 2 }, { itemName: 'Current', createdByUserId: 3 }],
    });
    expect(visible.events).toEqual([{ eventId: 2, createdByUserId: 1, tags: [{ userId: 3 }] }]);
    expect(visible.notes).toEqual([{ senderUserId: 1, replies: [{ senderUserId: 3 }] }]);
    expect(visible.wish.map(w => w.itemName)).toEqual(['Current']);
  });
});

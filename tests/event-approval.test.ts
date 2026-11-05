import { describe, expect, it } from 'vitest';
import { approvalState } from '../shared/event-approval.js';

describe('event approval status', () => {
  it('requires every selected approval, with progress', () => {
    expect(approvalState([{ response: 'accepted' }, { response: 'pending' }])).toEqual({ status: 'pending', approved: 1, total: 2, label: 'Pending approval' });
    expect(approvalState([{ response: 'accepted' }, { response: 'accepted' }]).status).toBe('confirmed');
  });
  it('keeps a declined plan unconfirmed even when other votes are pending', () => {
    expect(approvalState([{ response: 'declined' }, { response: 'pending' }]).status).toBe('changes_requested');
  });
  it('does not retroactively turn old informational tags into approval requests', () => {
    expect(approvalState([{ response: null }])).toMatchObject({ status: 'confirmed', total: 0 });
    expect(approvalState([]).total).toBe(0);
  });
});

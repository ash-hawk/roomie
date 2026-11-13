// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boardAnnouncement } from '../src/components/board-announcement.js';
import { boardRequest } from '../src/components/board-request.js';
const user = { userId: 1, firstName: 'Alex' };
const note = { messageId: 4, senderUserId: 1, messageText: 'Full announcement <text>', postedDate: '2026-11-13T12:00:00Z', replies: [{ messageId: 5, senderUserId: 1, messageText: 'Reply <text>', postedDate: '2026-11-13T13:00:00Z' }] };
const options = { members: [user], user, timezone: 'America/Denver', eventLink: () => '' };
describe('shared board presentation', () => {
  it('keeps the full post visible and collapses replies and their form on both boards', () => {
    for (const replyForm of ['home-note-reply', 'note-reply']) {
      document.body.innerHTML = boardAnnouncement(note, { ...options, replyForm });
      const conversation = document.querySelector('details');
      expect(conversation.open).toBe(false);
      expect(conversation.querySelector('summary').textContent).toBe('1 reply');
      expect(conversation.querySelector('form').dataset.form).toBe(replyForm);
      expect(document.querySelector('article > p').textContent).toBe(note.messageText);
      expect(document.querySelector('.board-comment p').textContent).toBe('Reply <text>');
      expect(document.querySelector('text')).toBeNull();
    }
  });
  it('retains feature actions and source IDs in the shared post layout', () => {
    document.body.innerHTML = boardAnnouncement(note, { ...options, resolveAction: 'note-resolve', replyManagement: r => `<button data-action="note-delete" data-id="${r.messageId}">Delete</button>` });
    expect(document.querySelector('[data-action=note-resolve]').dataset.id).toBe('4');
    expect(document.querySelector('[data-action=note-delete]').dataset.id).toBe('5');
    expect(document.querySelector('article').dataset.boardMessageIds).toBe('4 5');
  });
  it('uses the same request frame with escaped content and page-specific detail actions', () => {
    document.body.innerHTML = boardRequest({ kind: 'Cover request', title: 'Laundry <script>', metadata: '<p>Monday at 7 AM</p>', message: 'Please <help>', actions: '<button data-action="open-request">View chore</button>' });
    expect(document.querySelector('article').classList.contains('home-board-request')).toBe(true);
    expect(document.querySelector('b').textContent).toBe('Laundry <script>');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('.acts [data-action=open-request]')).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
vi.mock('../src/auth-client.js', () => ({ api: vi.fn() }));
import { api } from '../src/auth-client.js';
import { S } from '../src/lib/state.js';

it('defers a pending Home refresh while a roommate types, then updates when idle', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  try {
    const { homeView } = await import('../src/pages/home.js');
    const user = { userId: 1, firstName: 'Alex' };
    const roommate = { userId: 2, firstName: 'Sam' };
    S.user = user;
    S.hid = 1;
    S.households = [{ householdId: 1, timezone: 'America/Denver' }];
    localStorage.setItem('roomie.home.layout.1.1', JSON.stringify([
      { id: 'board', size: 'expanded' },
      { id: 'schedule', size: 'compact' },
      { id: 'finances', size: 'compact' },
    ]));
    document.body.innerHTML = '<div id="root" data-page="home"><main id="page"></main></div>';
    const note = { messageId: 1, senderUserId: 2, messageText: 'Original announcement', postedDate: '2026-11-16T18:00:00Z', replies: [] };
    const updated = { ...note, messageText: 'Updated announcement' };
    const boardRequest = Promise.withResolvers();
    let board = { notes: [note] };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith('/members')) return { members: [user, roommate] };
      if (path.endsWith('/events')) return { events: [] };
      if (path.endsWith('/chores')) return { chores: [], assignments: [], swapRequests: [] };
      if (path.endsWith('/board')) return board;
      if (path.endsWith('/wishlist')) return { items: [] };
      if (path.endsWith('/balances')) return { mine: [] };
      return { enabled: false };
    });
    document.getElementById('page').innerHTML = await homeView();
    board = boardRequest.promise;
    await vi.advanceTimersByTimeAsync(15000);
    const reply = document.querySelector('#home-board input[name=messageText]');
    reply.closest('details').open = true;
    reply.focus();
    reply.value = 'A reply in progress';
    boardRequest.resolve({ notes: [updated] });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(reply);
    expect(reply.value).toBe('A reply in progress');
    expect(document.getElementById('home-board').textContent).toContain('Original announcement');
    reply.blur();
    await vi.advanceTimersByTimeAsync(15000);
    expect(document.getElementById('home-board').textContent).toContain('Updated announcement');
    expect(document.querySelector('#home-board input[name=messageText]').value).toBe('A reply in progress');
  } finally {
    visibility.mockRestore();
    vi.useRealTimers();
  }
});

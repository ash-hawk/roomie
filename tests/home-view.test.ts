// @ts-nocheck -- exercise the browser JavaScript module with a minimal document stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.document = { addEventListener() {} }; });
vi.mock('../src/auth-client.js', () => ({ api: vi.fn() }));
import { api } from '../src/auth-client.js';
import { homeView } from '../src/pages/home.js';
import { S } from '../src/lib/state.js';
import { actions, inputs } from '../src/lib/events.js';

describe('shared Home activity', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T19:00:00Z'));
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    S.user = { userId: 1, firstName: 'Ashlynne', profilePhoto: 'photo', paymentMethods: ['venmo'] };
    S.hid = 1; S.households = [{ householdId: 1, householdName: 'Test', timezone: 'America/Denver' }];
    const responses = {
      members: { members: [{ userId: 1, firstName: 'Ashlynne' }, { userId: 2, firstName: 'Schmidt' }] },
      events: { events: [{ eventId: 1, eventName: 'Guests <script>', eventDate: '2026-11-05T01:00:00Z', createdByUserId: 1 }] },
      chores: { chores: [{ choreId: 2, choreName: 'Trash' }], assignments: [
        { choreId: 2, assignedUserId: 2, dueAt: '2026-11-05T00:00:00Z', isCompleted: false },
        { choreId: 2, assignedUserId: 1, dueAt: '2026-11-06T00:00:00Z', isCompleted: true },
      ] },
      expenses: { expenses: [{ itemName: 'Internet', purchaseDate: '2026-11-04', paidByUserId: 2, totalAmount: '30.00' }] },
      board: { notes: [{ messageText: 'House announcement', postedDate: '2026-11-04T20:00:00Z', senderUserId: 2 }] },
    };
    vi.mocked(api).mockImplementation(async (path) => responses[path.split('/').pop()]);
    actions['home-today'](); inputs['home-range']({ value: '7' }); actions['home-view']({ dataset: { value: 'list' } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('mixes all household activity and excludes completed chores without inventing payment deadlines', async () => {
    const html = await homeView();
    expect(html).toContain('Schmidt'); expect(html).toContain('House announcement'); expect(html).toContain('Expense');
    expect(html).toContain('Purchased'); expect(html).not.toContain('Due today');
    expect(html).toContain('Guests &lt;script&gt;'); expect(html).not.toContain('My chores');
    expect(html.match(/<b>Trash<\/b>/g)).toHaveLength(1);
    expect(html.indexOf('<b>Trash</b>')).toBeLessThan(html.indexOf('<b>Guests'));
  });
  it('shows the same activities in calendar view and supports moving to another date range', async () => {
    actions['home-view']({ dataset: { value: 'calendar' } });
    const html = await homeView(); expect(html).toContain('home-calendar');
    expect(html).toContain('Trash'); expect(html).toContain('Internet'); expect(html).toContain('House announcement');
    actions['home-next'](); expect(await homeView()).not.toContain('<b>Trash</b>');
    actions['home-today'](); expect(await homeView()).toContain('<b>Trash</b>');
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/auth-client.js', () => ({ api: vi.fn() }));
import { api } from '../src/auth-client.js';
import { S } from '../src/lib/state.js';
import { actions } from '../src/lib/events.js';
import { closeModal } from '../src/lib/dom.js';
import { bellHtml, openActivityPanel, openPendingActivity } from '../src/pages/notifications.js';

let notifications;
const base = { notificationId: 1, householdId: 1, section: 'chores', sourceType: 'chore_swap_request', sourceId: 7, message: 'Daisy asked someone to cover Laundry', createdAt: '2026-11-06T17:00:00Z', isRead: false, sourceGone: false, sourceStatus: 'pending', canRespond: true };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T18:00:00Z'));
  closeModal();
  S.user = { userId: 1 }; S.hid = 1;
  S.households = [{ householdId: 1, householdName: 'House one', timezone: 'America/Denver' }, { householdId: 2, householdName: 'House two', timezone: 'America/Denver' }];
  S.alerts = { unread: 1, swapPending: 1 };
  document.body.innerHTML = `<div id="page"></div><div id="toast"></div>${bellHtml()}`;
  history.replaceState(null, '', '#/home');
  notifications = [{ ...base }]; vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path, options = {}) => {
    if (path === '/notifications') return { notifications, unread: notifications.filter((n) => !n.isRead).length, swapPending: 1 };
    if (path === '/notifications/read-all') { notifications = notifications.map((n) => ({ ...n, isRead: true })); return {}; }
    if (options.method === 'PATCH') return {};
    throw new Error('Unexpected request ' + path);
  });
});

describe('personal activity panel', () => {
  it('opens from a non-navigation bell with compact links instead of duplicate response controls', async () => {
    const bell = document.querySelector('[data-bell]'); bell.focus();
    expect(bell.tagName).toBe('BUTTON'); expect(bell.hasAttribute('href')).toBe(false);
    await actions['activity-toggle']();
    expect(location.hash).toBe('#/home');
    const panel = document.getElementById('activity-panel');
    expect(panel.closest('[role=dialog]')).not.toBeNull();
    expect(panel.textContent).toContain('Daisy asked someone to cover Laundry');
    expect(panel.querySelectorAll('[data-action=activity-open]')).toHaveLength(1);
    expect(panel.querySelector('[data-action=nt-swap],[data-action=nt-pay],[data-action=nt-event]')).toBeNull();
    expect(panel.textContent).not.toMatch(/Accept|Decline|Check it out|Mark unread/);
    expect(document.querySelector('[data-bell]')).toBe(bell);
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('activity-panel')).toBeNull();
    expect(document.activeElement).toBe(bell);
    expect(bell.getAttribute('aria-expanded')).toBe('false');
  });
  it('marks a linked update read and opens its request after the feature data is ready', async () => {
    await openActivityPanel();
    const open = vi.fn(); actions['open-request'] = open;
    await actions['activity-open'](document.querySelector('[data-action=activity-open]'));
    expect(api).toHaveBeenCalledWith('/notifications/1', { method: 'PATCH', body: { isRead: true } });
    expect(location.hash).toBe('#/chores');
    expect(open).not.toHaveBeenCalled();
    openPendingActivity('chores');
    expect(open).toHaveBeenCalledWith({ dataset: { id: '7' } });
    expect(vi.mocked(api).mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
    expect(document.getElementById('activity-panel')).toBeNull();
  });
  it('switches the correct household and opens event details without approving the event', async () => {
    notifications = [{ ...base, householdId: 2, sourceType: 'event', sourceId: 9 }];
    await openActivityPanel(); const open = vi.fn(); actions['event-detail'] = open;
    await actions['activity-open'](document.querySelector('[data-action=activity-open]'));
    expect(S.hid).toBe(2); expect(localStorage.getItem('roomie.hid')).toBe('2');
    expect(location.hash).toBe('#/calendar'); openPendingActivity('calendar');
    expect(open).toHaveBeenCalledWith({ dataset: { id: '9' } });
    expect(vi.mocked(api).mock.calls.some(([path]) => path.includes('/respond'))).toBe(false);
  });
  it('keeps payment actions on Finances and only focuses the relevant payment', async () => {
    notifications = [{ ...base, sourceType: 'payment', sourceId: 42 }];
    await openActivityPanel(); const review = vi.fn(); actions.review = review;
    await actions['activity-open'](document.querySelector('[data-action=activity-open]'));
    document.getElementById('page').innerHTML = '<article data-activity-payment="42"><button data-action="review">Got it</button></article>';
    openPendingActivity('finances');
    expect(document.activeElement).toBe(document.querySelector('[data-activity-payment="42"]'));
    expect(review).not.toHaveBeenCalled();
    expect(vi.mocked(api).mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
  });
  it('supports empty and unavailable-source updates without broken links', async () => {
    notifications = []; await openActivityPanel();
    expect(document.getElementById('activity-panel').textContent).toContain('No updates yet');
    notifications = [{ ...base, sourceGone: true }]; await openActivityPanel();
    expect(document.getElementById('activity-panel').textContent).toContain('No longer available');
    expect(document.querySelector('[data-action=activity-open]')).toBeNull();
  });
  it('marks all read through the existing endpoint and updates the badge', async () => {
    await openActivityPanel();
    await actions['activity-read-all'](document.querySelector('[data-action=activity-read-all]'));
    expect(api).toHaveBeenCalledWith('/notifications/read-all', { method: 'POST', body: {} });
    expect(document.querySelector('[data-bell] .bdot')).toBeNull();
    expect(document.querySelector('.activity-dot.unread')).toBeNull();
  });
  it('shows retryable errors without losing the current page', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Offline'));
    await openActivityPanel();
    expect(location.hash).toBe('#/home');
    expect(document.getElementById('activity-panel').textContent).toContain('Couldn’t load');
    await actions['activity-retry']();
    expect(document.querySelector('[data-action=activity-open]')).not.toBeNull();
    vi.mocked(api).mockRejectedValueOnce(new Error('Offline'));
    await actions['activity-read-all'](document.querySelector('[data-action=activity-read-all]'));
    expect(document.getElementById('activity-error').textContent).toContain('Try again');
  });
});

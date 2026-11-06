// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/auth-client.js', () => ({ api: vi.fn() }));
import { api } from '../src/auth-client.js';
import { actions } from '../src/lib/events.js';
import { S } from '../src/lib/state.js';
import { financesView } from '../src/pages/finances.js';

const members = [
  { userId: 1, firstName: 'You' },
  { userId: 2, firstName: 'Daisy', lastName: 'Bell', profilePhoto: 'https://images.example/daisy.jpg', email: 'daisy@example.test', phoneNumber: '5551234567', paymentMethods: [{ app: 'venmo', username: '@daisy', isPreferred: true }] },
  { userId: 3, firstName: 'Charlotta', lastName: 'Agreste', paymentMethods: [] },
];
beforeEach(async () => {
  document.body.innerHTML = '<div id="page"></div><div id="toast"></div>';
  S.user = members[0]; S.hid = 1; S.households = [{ householdId: 1, timezone: 'America/Denver' }];
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith('/members')) return { members };
    if (path.endsWith('/balances')) return { mine: [{ otherUserId: 2, signedAmount: '-10', pendingAmount: '0', disputedAmount: '0' }, { otherUserId: 3, signedAmount: '5', pendingAmount: '0', disputedAmount: '0' }], payable: [{ payeeUserId: 2 }], pairs: [{ debtorUserId: 2, creditorUserId: 3, amount: '6' }], incoming: [], outgoing: [] };
    if (path.endsWith('/expenses')) return { expenses: [{ expenseId: 8, itemName: 'Paper towels', purchaseDate: '2026-11-06', totalAmount: '10', paidByUserId: 2, shares: [{ userId: 2, amountOwed: '5', status: 'buyer' }, { userId: 3, amountOwed: '5', status: 'unpaid' }] }] };
    throw new Error('Unexpected request ' + path);
  });
  document.getElementById('page').innerHTML = await financesView();
});
describe('finance roommate profiles', () => {
  it('opens contact and preferred payment details from balance photos and names, without sending money', async () => {
    const balance = document.querySelector('.finance-summary');
    const links = [...balance.querySelectorAll('[data-action=board-roommate-profile][data-id="2"]')];
    expect(links.some((button) => button.querySelector('img'))).toBe(true);
    expect(links.some((button) => button.textContent.includes('Daisy'))).toBe(true);
    await actions['board-roommate-profile'](links[0]);
    const modal = document.querySelector('[role=dialog]');
    expect(modal.textContent).toContain('Daisy Bell');
    expect(modal.textContent).toContain('daisy@example.test');
    expect(modal.textContent).toContain('5551234567');
    expect(modal.textContent).toContain('@daisy');
    expect(modal.textContent).toContain('Preferred');
    expect(vi.mocked(api).mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });
  it('provides profile links inside expense history and the expense details popup', async () => {
    const purchase = document.querySelector('[data-action=expense]');
    const link = purchase.querySelector('[data-action=board-roommate-profile][data-id="3"]');
    expect(link.closest('[data-action]')).toBe(link);
    await actions['board-roommate-profile'](link);
    expect(document.querySelector('[role=dialog]').textContent).toContain('Charlotta Agreste');
    actions.expense(purchase);
    expect(document.querySelector('[role=dialog] [data-action=board-roommate-profile][data-id="2"]')).not.toBeNull();
    expect(document.querySelector('[role=dialog] [data-action=board-roommate-profile][data-id="3"]')).not.toBeNull();
  });
  it('keeps former-roommate private details hidden', async () => {
    vi.mocked(api).mockResolvedValueOnce({ members: [{ ...members[1], leftDate: '2026-11-01' }] });
    await actions['board-roommate-profile'](document.querySelector('[data-action=board-roommate-profile][data-id="2"]'));
    const modal = document.querySelector('[role=dialog]');
    expect(modal.textContent).toContain('Contact details are hidden for former roommates');
    expect(modal.textContent).not.toContain('daisy@example.test');
    expect(modal.textContent).not.toContain('@daisy');
  });
});

import { esc, money } from '../lib/dom.js';
import { boardIdentity } from './board-profile.js';
import { toCents } from '../../shared/money.ts';

const PREVIEW_LIMIT = 3;
const financeLink = (label) => `<a class="btn s" href="#/finances" data-action="home-open-finances">${label}</a>`;

export function homeFinances({ balances, members, compact }) {
  const mine = balances.mine ?? [], incoming = balances.incoming ?? [];
  const member = (id) => members.find((person) => person.userId === id);
  const identity = (id) => boardIdentity(member(id), member(id)?.firstName || 'Roommate');
  const owes = mine.filter((balance) => toCents(balance.signedAmount) < 0);
  const owed = mine.filter((balance) => toCents(balance.signedAmount) > 0);
  const total = (items) => items.reduce((sum, balance) => sum + Math.abs(toCents(balance.signedAmount)), 0);
  const totals = `<div class="home-balance"><span>You owe <b>${money(total(owes))}</b></span><span>Owed to you <b>${money(total(owed))}</b></span></div>`;
  if (compact) return `<section class="card home-finances" data-item-kind="finance"><div><h2>Finances</h2><p class="hint">Your shared expense overview</p></div>${totals}${financeLink('Open finances')}</section>`;

  const balanceGroup = (title, items, empty) => `<section class="home-finance-group"><h3>${title}</h3>${items.slice(0, PREVIEW_LIMIT).map((balance) => {
    const pending = toCents(balance.pendingAmount ?? '0');
    const disputed = toCents(balance.disputedAmount ?? '0');
    return `<div class="home-finance-person"><div class="grow">${identity(balance.otherUserId)}${pending ? `<p class="hint">${money(pending)} sent, awaiting confirmation</p>` : ''}${disputed ? `<p class="hint">${money(disputed)} disputed</p>` : ''}</div><b class="amount">${money(Math.abs(toCents(balance.signedAmount)))}</b></div>`;
  }).join('') || `<p class="hint">${empty}</p>`}${items.length > PREVIEW_LIMIT ? financeLink(`View all (${items.length})`) : ''}</section>`;
  const waiting = `<section class="home-finance-group home-finance-waiting"><h3>Waiting on you</h3>${incoming.slice(0, PREVIEW_LIMIT).map((payment) => `<div class="home-finance-person"><div class="grow">${identity(payment.payerUserId)}<p class="hint">${payment.status === 'disputed' ? 'Payment disputed' : 'Payment awaiting your confirmation'}${payment.items?.length ? ` · ${esc(payment.items.map((item) => item.itemName).join(', '))}` : ''}</p></div><b class="amount">${money(toCents(payment.amount))}</b></div>`).join('') || '<p class="hint">No payments need your confirmation.</p>'}${incoming.length ? financeLink(incoming.length > PREVIEW_LIMIT ? `Review all payments (${incoming.length})` : 'Review payments') : ''}</section>`;
  return `<section class="card home-finances home-finances-expanded" data-item-kind="finance"><div class="home-finance-heading"><h2>Finances</h2>${financeLink('Open finances')}</div>${totals}<div class="home-finance-groups">${balanceGroup('You owe', owes, "You don’t owe anyone.")}${balanceGroup('Owed to you', owed, 'No one owes you.')}</div>${waiting}</section>`;
}

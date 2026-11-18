import { esc, money } from '../lib/dom.js';
import { boardIdentity } from './board-profile.js';
import { toCents } from '../../shared/money.ts';

const financeLink = (label) => `<a class="btn s ${label === 'Open finances' ? 'p' : ''}" href="#/finances" data-action="home-open-finances">${label}</a>`;

export function homeFinances({ balances, members, compact, wish = [] }) {
  const previewLimit = compact ? 1 : 3;
  const mine = (balances.mine ?? []).filter(b => members.some(m => m.userId === b.otherUserId && !m.leftDate));
  const member = (id) => members.find((person) => person.userId === id);
  const identity = (id) => boardIdentity(member(id), member(id)?.firstName || 'Roommate');
  const owes = mine.filter((balance) => toCents(balance.signedAmount) < 0);
  const owed = mine.filter((balance) => toCents(balance.signedAmount) > 0);
  const total = (items) => items.reduce((sum, balance) => sum + Math.abs(toCents(balance.signedAmount)), 0);
  const totals = `<div class="home-balance"><span>You owe <b>${money(total(owes))}</b></span><span>Owed to you <b>${money(total(owed))}</b></span></div>`;

  const balanceGroup = (title, items, empty) => `<section class="home-finance-group"><h3>${title}</h3>${items.slice(0, previewLimit).map((balance) => {
    const pending = toCents(balance.pendingAmount ?? '0');
    const disputed = toCents(balance.disputedAmount ?? '0');
    return `<div class="home-finance-person"><div class="grow">${identity(balance.otherUserId)}${pending ? `<p class="hint">${money(pending)} sent, awaiting confirmation</p>` : ''}${disputed ? `<p class="hint">${money(disputed)} disputed</p>` : ''}</div><b class="amount">${money(Math.abs(toCents(balance.signedAmount)))}</b></div>`;
  }).join('') || `<p class="hint">${empty}</p>`}${items.length > previewLimit ? financeLink(`View all (${items.length})`) : ''}</section>`;
  const openWish = wish.filter(w => !w.isBought && members.some(m => m.userId === w.createdByUserId && !m.leftDate));
  const wishPreview = `<section class="home-finance-group home-finance-wishlist"><h3>Wish list</h3>${[['need','Needs'],['want','Wants']].map(([kind,label]) => {
    const items = openWish.filter(w => (w.needOrWant === 'need' ? 'need' : 'want') === kind);
    return `<div class="home-wish-group"><h4>${label}</h4>${items.slice(0,previewLimit).map(w => `<div class="home-wish-row"><span>${esc(w.itemName)}</span>${w.estimatedPrice ? `<b>${money(toCents(w.estimatedPrice))}</b>` : ''}</div>`).join('') || '<p class="hint">Nothing on the list.</p>'}</div>`;
  }).join('')}<a class="btn s" href="#/finances" data-action="home-open-wishlist">View wish list</a></section>`;

  return `<section class="card home-finances home-finances-expanded ${compact ? 'home-finances-narrow' : ''}" data-item-kind="finance"><div class="home-finance-heading"><h2>Finances</h2>${financeLink('Open finances')}</div>${totals}<div class="home-finance-groups">${balanceGroup('You owe', owes, "You don’t owe anyone.")}${balanceGroup('Owed to you', owed, 'No one owes you.')}</div>${wishPreview}</section>`;
}

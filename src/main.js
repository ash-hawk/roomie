import './styles.css';
import { api, getToken, signOut } from './auth-client.js';
import { actions, forms, inputs } from './lib/events.js';
import { $, ico, mark, closeModal, esc, showError, toast } from './lib/dom.js';
import { S, household, resetState } from './lib/state.js';
import { authView } from './pages/auth.js';
import { onboardingView } from './pages/onboarding.js';
import { settingsView } from './pages/settings.js';
import { householdView } from './pages/household.js';
import { financesView } from './pages/finances.js';
import { choresView } from './pages/chores.js';
import { calendarView } from './pages/calendar.js';
import { bellHtml, loadAlerts, notificationsView, paintBell } from './pages/notifications.js';
import { homeView } from './pages/home.js';
import { soonView } from './pages/soon.js';
import { toCents } from '../shared/money.ts';

const NAV = [['home', 'home', 'Home'], ['calendar', 'calendar', 'Events'], ['finances', 'money', 'Finances'], ['chores', 'check', 'Chores'], ['household', 'users', 'Household']];
// Real pages register here as each slice lands; everything else shows the "coming next" card.
export const pages = { settings: settingsView, household: householdView, finances: financesView, chores: choresView, calendar: calendarView, notifications: notificationsView, home: homeView };

const root = $('#root');
const route = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0]; return r === 'notifications' || r === 'settings' || NAV.some(([k]) => k === r) ? r : 'home'; };
const loading = `<div class="page-skeleton" aria-label="Loading page" aria-busy="true"><div class="sk sk-title"></div><div class="sk sk-sub"></div>
  <div class="sk-grid"><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div></div>`;

async function loadMe() {
  const me = await api('/me');
  S.user = me.user; S.households = me.households;
  const saved = Number(localStorage.getItem('roomie.hid'));
  if (!S.households.some((h) => h.householdId === S.hid)) S.hid = S.households.find((h) => h.householdId === saved)?.householdId ?? S.households[0]?.householdId ?? null;
  if (S.hid) localStorage.setItem('roomie.hid', String(S.hid));
}

async function loadNavCounts() {
  if (S.navCounts.hid === S.hid && Date.now() - S.navCounts.at < 30_000) return;
  const [chores, balances] = await Promise.all([api(`/households/${S.hid}/chores`), api(`/households/${S.hid}/balances`)]);
  S.navCounts = {
    overdue: chores.assignments.filter((a) => !a.isCompleted && a.status === 'overdue' && a.assignedUserId === S.user.userId).length,
    owedCents: balances.mine.reduce((sum, b) => sum + Math.max(0, -toCents(b.signedAmount)), 0), at: Date.now(), hid: S.hid,
  };
}

function accentInk(hex) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#4338ca';
  const rgb = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .45 ? '#171721' : '#ffffff';
}

function shell(page, body) {
  const h = household();
  const count = (key) => key === 'chores' && S.navCounts.overdue ? String(S.navCounts.overdue) : key === 'finances' && S.navCounts.owedCents ? `$${Math.ceil(S.navCounts.owedCents / 100)}` : '';
  const items = NAV.map(([k, i, l]) => `<a href="#/${k}" class="nav-i ${k === page ? 'on' : ''}" ${k === page ? 'aria-current="page"' : ''}>${ico(i, 19)}<span>${l}</span>${count(k) ? `<span class="nav-count" aria-label="${k === 'chores' ? `${count(k)} overdue` : `${count(k)} owed`}">${count(k)}</span>` : ''}</a>`).join('');
  const accent = h.themeColor || '#4338ca'; document.documentElement.style.setProperty('--accent', accent); document.documentElement.style.setProperty('--on-accent', accentInk(accent));
  const account = S.user.profilePhoto ? `<img class="acct-photo" src="${esc(S.user.profilePhoto)}" alt="" referrerpolicy="no-referrer">` : esc(((S.user.firstName || '?')[0]).toUpperCase());
  return `<div class="shell"><div class="main">
    <header class="top"><div class="brand">${mark()}<div class="grow"><b>Roomie</b><small class="truncate">${esc(h.householdName)}</small></div></div>
      <div class="row" style="gap:10px">${bellHtml()}
      <button class="iconbtn acct" data-action="account" aria-label="Your profile and household">${account}</button></div></header>
    <nav class="pillnav" aria-label="Main">${items}</nav>
    <main class="page" id="page">${body}</main></div>
    <nav class="tabbar" aria-label="Main">${items}</nav></div>`;
}

let seq = 0;
export async function render() {
  const mine = ++seq;
  try {
    if (!(await getToken())) { resetState(); root.innerHTML = authView(); return; }
    if (!S.user) { root.innerHTML = loading; await loadMe(); }
    if (mine !== seq) return;
    if (!S.households.length) { root.innerHTML = onboardingView(); return; }
    const page = route();
    await Promise.all([page !== 'notifications' ? loadAlerts().catch(() => {}) : Promise.resolve(), loadNavCounts().catch(() => {})]);
    const keep = $('#page') && root.dataset.page === page; // soft refresh keeps the shell
    if (!keep) root.innerHTML = shell(page, loading);
    const body = pages[page] ? await pages[page]() : soonView(page);
    if (mine !== seq) return;
    root.dataset.page = page;
    if (keep) { $('#page').innerHTML = body; paintBell(); } else root.innerHTML = shell(page, body);
  } catch (e) {
    if (mine !== seq) return;
    if (e.status === 401) { resetState(); root.innerHTML = authView(); return; }
    root.innerHTML = `<div class="onb"><div class="box"><section class="card stack"><h2>Something went wrong</h2><p class="mute">${esc(e.message)}</p><button class="btn p" data-action="retry">Try again</button></section></div></div>`;
  }
}

// ---- events: one delegated listener for clicks and one for forms ---------------------------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  const fn = el && actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  try { await fn(el, e); } catch (err) { toast(err.message || 'Something went wrong'); }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest?.('[data-action][tabindex="0"]');
  if (!row || e.target.closest('button,a,input,select,textarea')) return;
  e.preventDefault(); row.click();
});
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  const fn = form && forms[form.dataset.form];
  if (!fn) return;
  e.preventDefault();
  const btn = form.querySelector('[type=submit]');
  form.setAttribute('aria-busy', 'true'); if (btn) btn.disabled = true;
  showError(form, '');
  try { await fn(form, e); } catch (err) { showError(form, err.message || 'Something went wrong'); }
  finally { form.removeAttribute('aria-busy'); if (btn) btn.disabled = form.dataset.saved === '1'; delete form.dataset.saved; }
});

for (const type of ['input', 'change']) document.addEventListener(type, (e) => {
  const el = e.target.closest?.('[data-input]');
  const fn = el && inputs[el.dataset.input];
  if (fn) try { fn(el, e); } catch (err) { console.error(err); }
});

actions['close-modal'] = () => closeModal();
actions.retry = () => render();
actions.signout = async () => { closeModal(); await signOut(); resetState(); localStorage.removeItem('roomie.hid'); location.hash = ''; render(); };
actions.account = () => {
  closeModal();

  if (location.hash === '#/settings') {
    render();
  } else {
    location.hash = '#/settings';
  }
};

window.addEventListener('hashchange', render);
window.addEventListener('roomie:render', render);
window.addEventListener('roomie:signedin', () => { resetState(); render(); });
window.addEventListener('roomie:reload', async () => { S.user = null; await render(); });

render();

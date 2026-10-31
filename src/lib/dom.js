// Small DOM helpers shared by every page. All user-supplied text MUST go through esc().
import { fromCents } from '../../shared/money.ts';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.3c-.5-.8-1.4-1.3-2.6-1.3-1.4 0-2.6.7-2.6 1.9 0 2.6 5.2 1.3 5.2 4 0 1.2-1.2 2-2.6 2-1.2 0-2.2-.5-2.8-1.4M12 6.5V8m0 8v1.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.4 2.6 2.6 5-5.4"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
};
export const ico = (n, s = 20) => `<svg class="i" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] ?? ''}</svg>`;
export const mark = (cls = '') => `<span class="mark ${cls}">${ico('home', cls ? 30 : 18)}</span>`;

const PALETTE = ['#4338ca', '#db2777', '#0d9488', '#d97706', '#7c3aed', '#0284c7'];
export function avatar(u, sz = '') {
  if (!u) return '';
  const first = (u.firstName || '?')[0];
  const photo = u.profilePhoto ? `<img src="${esc(u.profilePhoto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(first.toUpperCase());
  return `<span class="av ${sz}" style="background:${PALETTE[(u.userId ?? 0) % PALETTE.length]}" title="${esc(`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim())}">${photo}</span>`;
}
export const fullName = (u) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : 'Someone');

/** cents -> "$1,234.56" (negative as "-$1.00") */
export const money = (cents) => (cents < 0 ? '-' : '') + '$' + Number(fromCents(Math.abs(cents)).split('.')[0]).toLocaleString('en-US') + '.' + fromCents(Math.abs(cents)).split('.')[1];

/** Dates shown in the household's timezone (never the browser's). */
export const fmtDate = (iso, tz, opts = { month: 'short', day: 'numeric' }) => new Date(iso).toLocaleDateString('en-US', { ...opts, timeZone: tz });
export const fmtDay = (ymd, opts = { month: 'short', day: 'numeric' }) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

/** "5m ago", "2h ago", "3d ago", then a date in the household's timezone. */
export const ago = (iso, tz) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.round(m / 60)}h ago`; if (m < 10080) return `${Math.round(m / 1440)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
};

export function toast(msg) {
  const t = document.createElement('div'); t.className = 'tst'; t.textContent = msg; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  $('#toast').appendChild(t); setTimeout(() => t.remove(), 3200);
}

export const phead = (eyebrow, title, sub = '', actions = '') =>
  `<header class="ph page-header"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? `<p class="mute">${sub}</p>` : ''}</div>${actions ? `<div class="row page-actions">${actions}</div>` : ''}</header>`;
export const badge = (text, kind = '') => `<span class="badge ${kind}">${text}</span>`;
export const empty = (icon, title, sub, action = '') => `<div class="empty"><div style="font-size:34px">${icon}</div><b>${title}</b><p class="mute" style="font-size:14px">${sub}</p>${action}</div>`;
export const seg = (options, current, action) =>
  `<div class="seg" role="tablist">${options.map(([k, l]) => `<button role="tab" class="${k === current ? 'on' : ''}" data-action="${action}" data-value="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;

// ---- modal ---------------------------------------------------------------------------------
export function openModal(inner) {
  closeModal();
  const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const o = document.createElement('div');
  o.className = 'ovl pop'; o.id = 'modal';
  o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title">${inner}</div>`;
  o._restoreFocus = restore;
  o.addEventListener('click', (e) => { if (e.target === o) closeModal(); });
  document.body.appendChild(o);
  o.querySelector('input,select,textarea,button')?.focus();
}
export const closeModal = () => { const modal = document.getElementById('modal'); if (!modal) return; const restore = modal._restoreFocus; modal.remove(); window.dispatchEvent(new Event('roomie:modal-close')); restore?.focus?.(); };
export const mhead = (title) => `<div class="mh"><h3 id="modal-title">${title}</h3><button class="x" data-action="close-modal" aria-label="Close">✕</button></div>`;
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.confirm-ovl')) return;
  const modal = document.getElementById('modal'); if (!modal) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key !== 'Tab') return;
  const focusable = [...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return; const first = focusable[0], last = focusable.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

export function confirmDialog(title, message, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    const restore = document.activeElement, overlay = document.createElement('div'); overlay.className = 'ovl pop confirm-ovl';
    overlay.innerHTML = `<div class="sheet confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><div class="mh"><h3 id="confirm-title">${esc(title)}</h3></div><p>${esc(message)}</p><div class="acts"><button class="btn" data-confirm="no">Cancel</button><button class="btn d" data-confirm="yes">${esc(confirmLabel)}</button></div></div>`;
    const finish = (value) => { overlay.remove(); restore?.focus?.(); resolve(value); };
    overlay.addEventListener('click', (event) => { const choice = event.target.closest('[data-confirm]')?.dataset.confirm; if (choice) finish(choice === 'yes'); else if (event.target === overlay) finish(false); });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.body.appendChild(overlay); overlay.querySelector('[data-confirm=no]').focus();
  });
}

export const showError = (form, message) => { const b = form.querySelector('.err'); if (b) b.textContent = message; };

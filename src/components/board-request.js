import { esc } from '../lib/dom.js';

// Shared card frame; feature pages supply their existing detail/response actions.
export function boardRequest({ kind, title, metadata, message = '', status = '', actions, className = '' }) {
  return `<article class="home-board-request stack ${className}" data-item-kind="chore"><span class="home-kind">${esc(kind)}</span><b>${esc(title)}</b>${metadata}${message ? `<p class="home-board-message">${esc(message)}</p>` : ''}${status}<div class="acts">${actions}</div><div class="err" role="alert"></div></article>`;
}

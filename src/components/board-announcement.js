import { ago, esc, fullName } from '../lib/dom.js';
import { boardIdentity } from './board-profile.js';

// One announcement layout for Home and feature boards; each page owns its actions.
export function boardAnnouncement(n, { members, user, timezone, event, eventLink, compact = false,
  resolveAction = 'home-board-resolve', replyForm = 'home-note-reply', management = '', replyManagement = () => '' }) {
  const who = (id) => members.find((m) => m.userId === id);
  const name = (id) => id === user.userId ? 'You' : fullName(who(id));
  return `<article data-board-message-ids="${[n.messageId, ...(n.replies ?? []).map((r) => r.messageId)].join(' ')}" data-item-kind="${event ? 'event' : 'announcement'}" class="sticky ${n.isPinned ? 'pinned' : ''}"><span class="home-kind">Announcement</span><div class="row">${boardIdentity(who(n.senderUserId), name(n.senderUserId))}<span class="hint">${ago(n.postedDate, timezone)}</span>${n.isPinned ? '<span class="pin-mark">Pinned</span>' : ''}${management}${n.isResolved ? '<span class="st paid">Resolved</span>' : ''}</div><p>${esc(n.messageText)}</p>
      ${event ? eventLink(event) : ''}${n.canResolve !== false ? `<div class="acts"><button type="button" class="btn s" data-action="${resolveAction}" data-id="${n.messageId}" data-resolved="${!n.isResolved}">${n.isResolved ? 'Reopen' : 'Mark as Resolved'}</button></div><div class="err" role="alert"></div>` : ''}${compact ? '' : `<details class="home-board-conversation" data-board-entry="replies-${n.messageId}"><summary>${n.replies?.length ? `${n.replies.length} ${n.replies.length === 1 ? 'reply' : 'replies'}` : 'Reply'}</summary>`}${(n.replies ?? []).map((r) => `<div class="reply board-comment">${boardIdentity(who(r.senderUserId), null)}<div class="grow"><div class="row">${boardIdentity(who(r.senderUserId), name(r.senderUserId), false)}<span class="hint">${ago(r.postedDate, timezone)}</span></div><p>${esc(r.messageText)}</p></div>${replyManagement(r)}</div>`).join('')}
      <form class="stack" data-form="${replyForm}" data-id="${n.messageId}"><div class="row replyf"><input class="input" name="messageText" maxlength="500" placeholder="Reply" aria-label="Reply to ${esc(fullName(who(n.senderUserId)))}" required><button class="btn s" type="submit">Reply</button></div><div class="err" role="alert"></div></form>${compact ? '' : '</details>'}</article>`;
}

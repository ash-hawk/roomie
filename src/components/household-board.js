import { ago, esc, fullName, ico } from '../lib/dom.js';
import { boardIdentity } from './board-profile.js';
import { approvalState } from '../../shared/event-approval.ts';

export function householdBoard({ members, events, chores, notes, user, timezone, compact = false, archive = false, limit = Infinity }) {
  const who = (id) => members.find((m) => m.userId === id);
  const name = (id) => id === user.userId ? 'You' : fullName(who(id));
  const when = (at) => new Date(at).toLocaleString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const assignment = (id) => chores.assignments.find((a) => a.assignmentId === id);
  const choreName = (a) => chores.chores.find((c) => c.choreId === a?.choreId)?.choreName ?? 'Chore';
  const entry = (html, at, key, pinned = false) => ({ html, at: Date.parse(at) || 0, key, pinned });
  const button = (kind, id, action, text, primary = false) => `<button type="button" class="btn s ${primary ? 'p' : ''}" data-action="home-board-response" data-kind="${kind}" data-id="${id}" data-response="${action}">${text}</button>`;
  const eventLink = (event) => `<a class="btn s home-board-view" href="#/calendar" data-action="home-open" data-kind="event" data-id="${event.eventId}">View event</a>`;
  const requestCard = (request, mine) => {
    const a = assignment(request.requesterAssignmentId), target = assignment(request.targetAssignmentId);
    if (!a || a.isCompleted) return '';
    const cover = request.type === 'skip';
    return `<article class="home-board-request stack" data-item-kind="chore"><span class="home-kind">${cover ? 'Cover request' : 'Swap request'}</span><b>${mine ? `You ${cover ? 'need someone to cover' : 'asked to swap'}` : `${esc(name(request.requesterUserId))} ${cover ? 'needs someone to cover' : 'asked to swap'}`} ${esc(choreName(a))}</b>
      <p class="hint">${esc(when(a.dueAt))}${target ? ` · Swap with ${esc(choreName(target))} (${esc(when(target.dueAt))})` : ''}</p>
      ${request.requestMessage ? `<p class="home-board-message">${esc(request.requestMessage)}</p>` : ''}
      ${mine ? `<span class="st unpaid">${cover ? 'Waiting for a volunteer' : `Waiting for ${esc(name(request.targetUserId))}`}</span>` : ''}
      <div class="acts"><button type="button" class="btn s home-board-view" data-action="home-chore-detail" data-id="${a.assignmentId}">View chore</button>${mine ? button('chore', request.swapId, 'withdraw', 'Cancel request') : cover ? '' : `${button('chore', request.swapId, 'accept', 'Accept swap', true)}${button('chore', request.swapId, 'decline', 'Decline swap')}`}</div><div class="err" role="alert"></div></article>`;
  };
  const openEvents = events.filter((e) => Date.parse(e.endDate ?? e.eventDate) >= Date.now());
  const incoming = [
    ...(chores.swapRequests ?? []).filter((r) => r.requesterUserId !== user.userId && (r.type === 'skip' || r.targetUserId === user.userId)).map((r) => entry(requestCard(r, false), r.requestedDate ?? assignment(r.requesterAssignmentId)?.dueAt, `chore-${r.swapId}`)),
    ...openEvents.filter((e) => e.tags.some((t) => t.userId === user.userId && t.response === 'pending')).map((e) => entry(`<article class="home-board-request stack" data-item-kind="event"><span class="home-kind">Event approval</span><b>${esc(e.eventName)}</b><p class="hint">${esc(when(e.eventDate))} · Asked by ${esc(name(e.createdByUserId))}</p><div class="acts">${button('event', e.eventId, 'accepted', 'Approve', true)}${button('event', e.eventId, 'declined', 'Request changes')}${eventLink(e)}</div><div class="err" role="alert"></div></article>`, e.createdAt ?? e.eventDate, `event-${e.eventId}`)),
  ].filter(Boolean);
  const outgoing = [
    ...(chores.swapRequests ?? []).filter((r) => r.requesterUserId === user.userId).map((r) => entry(requestCard(r, true), r.requestedDate ?? assignment(r.requesterAssignmentId)?.dueAt, `chore-${r.swapId}`)),
    ...openEvents.filter((e) => e.createdByUserId === user.userId && approvalState(e.tags).total && approvalState(e.tags).status !== 'confirmed').map((e) => { const state = approvalState(e.tags); return entry(`<article class="home-board-request stack" data-item-kind="event"><span class="home-kind">Event approval</span><b>${esc(e.eventName)}</b><p class="hint">${esc(when(e.eventDate))}</p><span class="st ${state.status === 'changes_requested' ? 'disputed' : 'unpaid'}">${state.label} · ${state.approved} of ${state.total} approved</span><div class="acts">${eventLink(e)}</div></article>`, e.createdAt ?? e.eventDate, `event-${e.eventId}`); }),
  ].filter(Boolean);
  const note = (n) => {
    const event = events.find((e) => e.eventId === n.eventId);
    return `<article data-item-kind="${event ? 'event' : 'announcement'}" class="sticky ${n.isPinned ? 'pinned' : ''}"><span class="home-kind">Announcement</span><div class="row">${boardIdentity(who(n.senderUserId), name(n.senderUserId))}<span class="hint">${ago(n.postedDate, timezone)}</span>${n.isPinned ? '<span class="pin-mark">Pinned</span>' : ''}${n.isResolved ? '<span class="st paid">Resolved</span>' : ''}</div><p>${esc(n.messageText)}</p>
      ${event ? eventLink(event) : ''}${n.canResolve !== false ? `<div class="acts"><button type="button" class="btn s" data-action="home-board-resolve" data-id="${n.messageId}" data-resolved="${!n.isResolved}">${n.isResolved ? 'Reopen' : 'Mark as Resolved'}</button></div><div class="err" role="alert"></div>` : ''}${compact ? '' : `<details class="home-board-conversation" data-board-entry="replies-${n.messageId}"><summary>${n.replies?.length ? `${n.replies.length} ${n.replies.length === 1 ? 'reply' : 'replies'}` : 'Reply'}</summary>`}${(n.replies ?? []).map((r) => `<div class="reply board-comment">${boardIdentity(who(r.senderUserId), null)}<div class="grow"><div class="row">${boardIdentity(who(r.senderUserId), name(r.senderUserId), false)}<span class="hint">${ago(r.postedDate, timezone)}</span></div><p>${esc(r.messageText)}</p></div></div>`).join('')}
      <form class="stack" data-form="home-note-reply" data-id="${n.messageId}"><div class="row replyf"><input class="input" name="messageText" maxlength="500" placeholder="Reply" aria-label="Reply to ${esc(fullName(who(n.senderUserId)))}" required><button class="btn s" type="submit">Reply</button></div><div class="err" role="alert"></div></form>${compact ? '' : '</details>'}</article>`;
  };
  const visibleNotes = notes.filter((n) => Boolean(n.isResolved) === archive);
  const feed = [...(archive ? [] : [...incoming, ...outgoing]), ...visibleNotes.map((n) => entry(note(n), n.postedDate, `note-${n.messageId}`, Boolean(n.isPinned)))]
    .filter((item) => item.html)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at || a.key.localeCompare(b.key));
  const compactEntry = (item) => {
    const [kind, id] = item.key.split('-');
    const event = kind === 'event' ? events.find((e) => e.eventId === Number(id)) : null;
    const request = kind === 'chore' ? (chores.swapRequests ?? []).find((r) => r.swapId === Number(id)) : null;
    const announcement = kind === 'note' ? notes.find((n) => n.messageId === Number(id)) : null;
    const title = event ? event.eventName : request ? choreName(assignment(request.requesterAssignmentId)) : announcement?.messageText ?? '';
    const type = event ? 'Event approval' : request ? (request.type === 'skip' ? 'Cover request' : 'Swap request') : `${announcement?.isResolved ? 'Resolved announcement' : 'Announcement'} · ${name(announcement?.senderUserId)}`;
    return `<details class="home-board-summary" data-item-kind="${event || events.some((e) => e.eventId === announcement?.eventId) ? 'event' : request ? 'chore' : 'announcement'}" data-board-entry="${item.key}"><summary><span class="home-kind">${esc(type)}</span><b>${esc(title)}</b><span class="hint">${event ? esc(when(event.eventDate)) : request ? esc(when(assignment(request.requesterAssignmentId)?.dueAt)) : esc(ago(announcement?.postedDate, timezone))}</span></summary>${item.html}</details>`;
  };
  return `<div class="row sp home-board-heading"><h2>Household board</h2><button type="button" class="btn p home-make-announcement" data-action="home-make-announcement">Make announcement</button></div>
    <div class="row home-board-filters" role="group" aria-label="Household board filter"><button type="button" class="btn s ${archive ? '' : 'p'}" data-action="home-board-filter" data-archive="false" aria-pressed="${!archive}">Current messages</button><button type="button" class="btn s ${archive ? 'p' : ''}" data-action="home-board-filter" data-archive="true" aria-pressed="${archive}">Resolved messages</button></div>
    <div class="stack home-board-feed" aria-label="${archive ? 'Resolved household announcements' : 'Household announcements and requests'}">${feed.slice(0, limit).map((item) => compact ? compactEntry(item) : item.html).join('') || `<p class="hint">${archive ? 'No resolved messages.' : 'No announcements or open requests right now.'}</p>`}</div>${Number.isFinite(limit) && feed.length ? `<button class="btn s home-board-view-all" data-action="home-board-all">View all (${feed.length})</button>` : ''}`;

}

export function announcementForm(events) {
  const upcoming = events.filter((e) => Date.parse(e.endDate ?? e.eventDate) >= Date.now());
  return `<form class="stack" data-form="home-note-new"><label class="fld"><span>Announcement</span><textarea class="input" name="messageText" rows="4" required maxlength="500" placeholder="Share something with your household"></textarea></label><label class="fld"><span>Link an event (optional)</span><select class="input" name="eventId"><option value="">No linked event</option>${upcoming.map((e) => `<option value="${e.eventId}">${esc(e.eventName)}</option>`).join('')}</select></label><div><button type="button" class="btn s" data-action="home-add-linked-event">${ico('plus', 14)} Add and link event</button></div><div class="err" role="alert"></div><div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit">Post</button></div></form>`;
}

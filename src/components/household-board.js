import { ago, esc, fullName } from '../lib/dom.js';
import { boardIdentity } from './board-profile.js';
import { approvalState } from '../../shared/event-approval.ts';

export function householdBoard({ members, events, chores, notes, user, timezone }) {
  const who = (id) => members.find((m) => m.userId === id);
  const name = (id) => id === user.userId ? 'You' : fullName(who(id));
  const when = (at) => new Date(at).toLocaleString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const assignment = (id) => chores.assignments.find((a) => a.assignmentId === id);
  const choreName = (a) => chores.chores.find((c) => c.choreId === a?.choreId)?.choreName ?? 'Chore';
  const entry = (html, at, key, pinned = false) => ({ html, at: Date.parse(at) || 0, key, pinned });
  const button = (kind, id, action, text, primary = false) => `<button type="button" class="btn s ${primary ? 'p' : ''}" data-action="home-board-response" data-kind="${kind}" data-id="${id}" data-response="${action}">${text}</button>`;
  const eventLink = (event) => `<a class="btn s" href="#/calendar" data-action="home-open" data-kind="event" data-id="${event.eventId}">View event</a>`;
  const requestCard = (request, mine) => {
    const a = assignment(request.requesterAssignmentId), target = assignment(request.targetAssignmentId);
    if (!a || a.isCompleted) return '';
    const cover = request.type === 'skip';
    return `<article class="home-board-request stack"><span class="home-kind">${cover ? 'Cover request' : 'Swap request'}</span><b>${mine ? `You ${cover ? 'need someone to cover' : 'asked to swap'}` : `${esc(name(request.requesterUserId))} ${cover ? 'needs someone to cover' : 'asked to swap'}`} ${esc(choreName(a))}</b>
      <p class="hint">${esc(when(a.dueAt))}${target ? ` · Swap with ${esc(choreName(target))} (${esc(when(target.dueAt))})` : ''}</p>
      ${request.requestMessage ? `<p class="home-board-message">${esc(request.requestMessage)}</p>` : ''}
      ${mine ? `<span class="st unpaid">${cover ? 'Waiting for a volunteer' : `Waiting for ${esc(name(request.targetUserId))}`}</span>` : ''}
      <div class="acts"><a class="btn s" href="#/chores">View in Chores</a>${mine ? button('chore', request.swapId, 'withdraw', 'Cancel request') : `${button('chore', request.swapId, 'accept', cover ? 'I can cover' : 'Accept swap', true)}${cover ? '' : button('chore', request.swapId, 'decline', 'Decline swap')}`}</div><div class="err" role="alert"></div></article>`;
  };
  const openEvents = events.filter((e) => Date.parse(e.endDate ?? e.eventDate) >= Date.now());
  const incoming = [
    ...(chores.swapRequests ?? []).filter((r) => r.requesterUserId !== user.userId && (r.type === 'skip' || r.targetUserId === user.userId)).map((r) => entry(requestCard(r, false), r.requestedDate ?? assignment(r.requesterAssignmentId)?.dueAt, `chore-${r.swapId}`)),
    ...openEvents.filter((e) => e.tags.some((t) => t.userId === user.userId && t.response === 'pending')).map((e) => entry(`<article class="home-board-request stack"><span class="home-kind">Event approval</span><b>${esc(e.eventName)}</b><p class="hint">${esc(when(e.eventDate))} · Asked by ${esc(name(e.createdByUserId))}</p><div class="acts">${button('event', e.eventId, 'accepted', 'Approve', true)}${button('event', e.eventId, 'declined', 'Request changes')}${eventLink(e)}</div><div class="err" role="alert"></div></article>`, e.createdAt ?? e.eventDate, `event-${e.eventId}`)),
  ].filter(Boolean);
  const outgoing = [
    ...(chores.swapRequests ?? []).filter((r) => r.requesterUserId === user.userId).map((r) => entry(requestCard(r, true), r.requestedDate ?? assignment(r.requesterAssignmentId)?.dueAt, `chore-${r.swapId}`)),
    ...openEvents.filter((e) => e.createdByUserId === user.userId && approvalState(e.tags).total && approvalState(e.tags).status !== 'confirmed').map((e) => { const state = approvalState(e.tags); return entry(`<article class="home-board-request stack"><span class="home-kind">Event approval</span><b>${esc(e.eventName)}</b><p class="hint">${esc(when(e.eventDate))}</p><span class="st ${state.status === 'changes_requested' ? 'disputed' : 'unpaid'}">${state.label} · ${state.approved} of ${state.total} approved</span><div class="acts">${eventLink(e)}</div></article>`, e.createdAt ?? e.eventDate, `event-${e.eventId}`); }),
  ].filter(Boolean);
  const note = (n) => {
    const event = events.find((e) => e.eventId === n.eventId);
    return `<article class="sticky ${n.isPinned ? 'pinned' : ''}"><span class="home-kind">Announcement</span><div class="row">${boardIdentity(who(n.senderUserId), name(n.senderUserId))}<span class="hint">${ago(n.postedDate, timezone)}</span>${n.isPinned ? '<span class="pin-mark">Pinned</span>' : ''}</div><p>${esc(n.messageText)}</p>
      ${event ? eventLink(event) : ''}${(n.replies ?? []).map((r) => `<div class="reply board-comment">${boardIdentity(who(r.senderUserId), null)}<div class="grow"><div class="row">${boardIdentity(who(r.senderUserId), name(r.senderUserId), false)}<span class="hint">${ago(r.postedDate, timezone)}</span></div><p>${esc(r.messageText)}</p></div></div>`).join('')}
      <form class="stack" data-form="home-note-reply" data-id="${n.messageId}"><div class="row replyf"><input class="input" name="messageText" maxlength="500" placeholder="Reply" aria-label="Reply to ${esc(fullName(who(n.senderUserId)))}" required><button class="btn s" type="submit">Reply</button></div><div class="err" role="alert"></div></form></article>`;
  };
  const feed = [...incoming, ...outgoing, ...notes.map((n) => entry(note(n), n.postedDate, `note-${n.messageId}`, Boolean(n.isPinned)))]
    .filter((item) => item.html)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at || a.key.localeCompare(b.key));
  return `<div class="row sp home-board-heading"><h2>Household board</h2><button type="button" class="btn p home-make-announcement" data-action="home-make-announcement">Make announcement</button></div>
    <div class="stack home-board-feed" aria-label="Household announcements and requests">${feed.map((item) => item.html).join('') || '<p class="hint">No announcements or open requests right now.</p>'}</div>`;

}

export function announcementForm(events) {
  const upcoming = events.filter((e) => Date.parse(e.endDate ?? e.eventDate) >= Date.now());
  return `<form class="stack" data-form="home-note-new"><label class="fld"><span>Announcement</span><textarea class="input" name="messageText" rows="4" required maxlength="500" placeholder="Share something with your household"></textarea></label><label class="fld"><span>Link an event (optional)</span><select class="input" name="eventId"><option value="">No linked event</option>${upcoming.map((e) => `<option value="${e.eventId}">${esc(e.eventName)}</option>`).join('')}</select></label><div class="err" role="alert"></div><div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn p" type="submit">Post</button></div></form>`;
}

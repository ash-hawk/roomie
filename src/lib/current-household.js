// Old records may still arrive in history responses. Do not surface a departed
// roommate's identity or unfinished work in the active household UI.
export const isCurrentMember = (members, id) => members.some(m => m.userId === id && !m.leftDate);
export function currentHouseholdData(members, data) {
  const current = id => isCurrentMember(members, id);
  const result = { ...data };
  if (data.events) result.events = data.events.filter(e => current(e.createdByUserId)).map(e => ({ ...e, tags: (e.tags ?? []).filter(t => current(t.userId)) }));
  if (data.notes) result.notes = data.notes.filter(n => current(n.senderUserId)).map(n => ({ ...n, replies: (n.replies ?? []).filter(r => current(r.senderUserId)) }));
  if (data.assignments) result.assignments = data.assignments.filter(a => current(a.assignedUserId));
  if (data.swapRequests) result.swapRequests = data.swapRequests.filter(r => current(r.requesterUserId) && (r.targetUserId == null || current(r.targetUserId)));
  if (data.chores && !Array.isArray(data.chores)) result.chores = currentHouseholdData(members, data.chores);
  if (data.chores && Array.isArray(data.chores)) {
    result.chores = data.chores.map(c => ({ ...c, ...(c.rotation ? { rotation: c.rotation.filter(current) } : {}) }))
      .filter(c => c.rotation?.length || result.assignments?.some(a => a.choreId === c.choreId) || (!c.rotation?.length && current(c.createdByUserId)));
  }
  if (data.wish) result.wish = data.wish.filter(w => current(w.createdByUserId));
  return result;
}

/** Legacy informational tags have no vote and do not retroactively block old events. */
export function approvalState(tags: { response: string | null }[]) {
  const asked = tags.filter((t) => t.response !== null);
  const approved = asked.filter((t) => t.response === 'accepted').length;
  const status = asked.some((t) => t.response === 'declined') ? 'changes_requested' : approved < asked.length ? 'pending' : 'confirmed';
  return { status, approved, total: asked.length, label: status === 'changes_requested' ? 'Changes requested' : status === 'pending' ? 'Pending approval' : 'Confirmed' };
}

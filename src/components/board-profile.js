import { actions } from '../lib/events.js';
import { api } from '../auth-client.js';
import { household } from '../lib/state.js';
import { avatar, esc, fullName } from '../lib/dom.js';
import { openRoommateProfile } from '../pages/household.js';

export function boardIdentity(member, label, showAvatar = true) {
  const content = `${showAvatar ? avatar(member, 'sm') : ''}${label ? `<b>${esc(label)}</b>` : ''}`;
  if (!member) return `<span class="board-profile-link">${content}</span>`;
  return `<button type="button" class="board-profile-link" data-action="board-roommate-profile" data-id="${member.userId}" aria-label="View ${esc(fullName(member))}'s profile">${content}</button>`;
}
actions['board-roommate-profile'] = async (button) => {
  const householdId = household()?.householdId; if (!householdId) return;
  button.disabled = true;
  try {
    // Fetch the current household's redacted member data; no dependency on visiting Household first.
    const { members } = await api(`/households/${householdId}/members`);
    if (household()?.householdId !== householdId) return;
    const member = members.find((m) => m.userId === Number(button.dataset.id));
    if (member) openRoommateProfile(member);
  } finally { button.disabled = false; }
};

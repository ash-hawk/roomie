import { actions } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { avatar, badge, esc, fmtDate, fullName, phead, toast } from '../lib/dom.js';

export async function settingsView() {
  const h = household();
  const { members } = await api(`/households/${h.householdId}/members`);

  const current = members.filter((m) => !m.leftDate);
  const former = members.filter((m) => m.leftDate);

  const row = (m) => `
    <div class="item row">
      ${avatar(m)}
      <div class="grow">
        <b>${esc(fullName(m))}</b>
        ${m.userId === S.user.userId ? ' <span class="mute">(you)</span>' : ''}
        <div class="mute" style="font-size:13px">
          ${m.leftDate
            ? `Moved out ${fmtDate(m.leftDate, h.timezone)}`
            : `Joined ${fmtDate(m.joinedDate, h.timezone)}`}
        </div>
      </div>
      ${badge(
        m.role === 'owner' ? 'Owner' : 'Member',
        m.leftDate ? 'gray' : ''
      )}
    </div>`;

  return `
    ${phead('Your space', 'Settings', 'Your account and household in one place.')}

    <div class="stack">
      <section class="card">
        <h2>Your profile</h2>
        <div class="item row">
          ${avatar(S.user)}
          <div class="grow">
            <b>${esc(fullName(S.user))}</b>
            <div class="mute" style="font-size:13px">
              ${esc(S.user.email)}
            </div>
          </div>
        </div>
        <div class="acts" style="justify-content:flex-start;margin-top:12px">
          <button class="btn d" data-action="signout">Sign out</button>
        </div>
      </section>

      <section class="card invite-card">
        <div class="eyebrow">Your household</div>
        <h2>${esc(h.householdName)}</h2>
        <p class="mute">
          ${current.length} ${current.length === 1 ? 'member' : 'members'}
          · ${esc(h.timezone)}
        </p>

        <hr class="hr">
        <h3>Roommates</h3>
        ${current.map(row).join('')}

        ${former.length ? `
          <details style="margin-top:16px">
            <summary>Former roommates (${former.length})</summary>
            ${former.map(row).join('')}
          </details>
        ` : ''}

        <hr class="hr">
        <h3>Invite roommates</h3>
        <p class="mute invite-description">
          Share this code. Anyone who signs up can join with it.
        </p>
        <div class="rowline">
          <span class="code">${esc(h.joinCode)}</span>
          <button
            class="btn"
            data-action="copy-code"
            data-code="${esc(h.joinCode)}"
          >Copy</button>
        </div>
      </section>
    </div>`;
}
actions['copy-code'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.code); toast('Join code copied'); } catch { toast(`Your code is ${el.dataset.code}`); } };

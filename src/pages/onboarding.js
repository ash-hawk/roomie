import { actions, forms, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S, household } from '../lib/state.js';
import { esc, fullName, mark, showError, toast } from '../lib/dom.js';

const STEP_KEY = 'roomie.onboarding.step';
const PAYMENT_APPS = [['venmo', 'Venmo'], ['zelle', 'Zelle'], ['apple_cash', 'Apple Cash']];
const CHORES = [['trash', 'Trash'], ['dishes', 'Dishes'], ['bathroom', 'Bathroom'], ['vacuuming', 'Vacuuming'], ['kitchen', 'Kitchen wipe-down'], ['recycling', 'Recycling']];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let draft = null, emailSettings = null, welcome = null, profilePhoto = null;
let setupTasks = [], setupDone = 0, setupError = '';

const currentStep = () => Math.min(6, Math.max(1, Number(sessionStorage.getItem(STEP_KEY)) || 1));
const go = (step) => { sessionStorage.setItem(STEP_KEY, String(step)); window.dispatchEvent(new Event('roomie:render')); };
const owner = () => household()?.role === 'owner';
const nextAfterHouseSetup = () => owner() ? 4 : 5;

function frame(step, title, subtitle, body) {
  const previous = step === 1 ? null : step === 5 && !owner() ? 3 : step - 1;
  return `<div class="onb onboarding-wizard"><div class="box wizard-box">
    <div class="wizard-brand">${mark('lg')}<div><span class="eyebrow">Step ${step} of 6</span><h1>${esc(title)}</h1><p class="mute">${esc(subtitle)}</p></div></div>
    <div class="wizard-progress" aria-hidden="true"><span style="width:${step / 6 * 100}%"></span></div>
    ${body}
    <div class="row sp wizard-foot">${previous ? `<button class="btn" data-action="onboarding-back" data-step="${previous}">Back</button>` : '<span></span>'}<button class="link-btn" data-action="signout">Sign out</button></div>
  </div></div>`;
}

function profileStep() {
  const methods = Object.fromEntries((S.user.paymentMethods ?? []).map((method) => [method.app, method]));
  const preferred = (S.user.paymentMethods ?? []).find((method) => method.isPreferred)?.app ?? 'venmo';
  if (profilePhoto === null) profilePhoto = S.user.profilePhoto ?? '';
  return frame(1, 'Make Roomie feel like yours', 'Your roommates use this information to recognize and pay you.', `<form class="card stack" data-form="onboarding-profile">
    <div class="inline-grid"><label class="fld"><span>First name</span><input class="input" name="firstName" maxlength="80" required value="${esc(S.user.firstName)}"></label>
      <label class="fld"><span>Last name</span><input class="input" name="lastName" maxlength="80" value="${esc(S.user.lastName)}"></label></div>
    <label class="fld"><span>Phone (optional)</span><input class="input" name="phoneNumber" type="tel" maxlength="40" value="${esc(S.user.phoneNumber ?? '')}" placeholder="(801) 555-0123"></label>
    <div class="fld"><span>Profile photo (optional)</span><label class="btn s photo-pick">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" data-input="onboarding-photo"></label><span class="hint" id="onboarding-photo-status">${profilePhoto ? 'Photo ready' : 'You can add this later'}</span></div>
    <fieldset class="payment-editor"><legend>Payment apps</legend><p class="hint">Add any handles your roommates can use.</p>
      <div class="payment-fields">${PAYMENT_APPS.map(([app, label]) => `<label class="fld"><span>${label}</span><input class="input" name="pay_${app}" maxlength="120" value="${esc(methods[app]?.username ?? '')}" placeholder="${app === 'venmo' ? '@username' : 'Phone or email'}"></label>`).join('')}</div>
      <label class="fld"><span>Preferred app</span><select class="input" name="preferred">${PAYMENT_APPS.map(([app, label]) => `<option value="${app}" ${preferred === app ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    </fieldset><div class="err" role="alert"></div><button class="btn p" type="submit">Save and continue</button></form>`);
}

function householdStep() {
  const h = household();
  if (h) return frame(2, 'Your household', 'You are connected. Continue when you are ready.', `<section class="card stack"><span class="eyebrow">Current household</span><h2>${esc(h.householdName)}</h2><p class="mute">${esc(h.address || h.timezone)}</p><button class="btn p" data-action="onboarding-next" data-step="3">Continue</button></section>`);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [browserTz];
  return frame(2, 'Find your household', 'Join your roommates with a code, or start a new household.', `<div class="wizard-choice-grid">
    <form class="card stack" data-form="onboarding-join"><h2>Join with a code</h2><label class="fld"><span>Join code</span><input class="input code" name="joinCode" required maxlength="20" autocapitalize="characters" autocomplete="off" placeholder="MAPLE412"></label><div class="err" role="alert"></div><button class="btn p" type="submit">Join household</button></form>
    <form class="card stack" data-form="onboarding-create"><h2>Start a household</h2><label class="fld"><span>Household name</span><input class="input" name="householdName" required maxlength="80" placeholder="412 Maple St"></label><label class="fld"><span>Address (optional)</span><input class="input" name="address" maxlength="200"></label><label class="fld"><span>Timezone</span><select class="input" name="timezone">${zones.map((zone) => `<option ${zone === browserTz ? 'selected' : ''}>${esc(zone)}</option>`).join('')}</select></label><div class="err" role="alert"></div><button class="btn" type="submit">Create household</button></form>
  </div>`);
}

function questionsStep() {
  return frame(3, 'Set up your house', 'Answer five quick questions. You can edit every suggestion before saving.', `<form class="card stack" data-form="onboarding-suggest">
    <fieldset><legend>Which chores matter here?</legend><div class="onboarding-chips">${CHORES.map(([key, label]) => `<label class="chip-check"><input type="checkbox" name="chores" value="${key}" checked><span>${label}</span></label>`).join('')}</div></fieldset>
    <fieldset><legend>How clean is clean enough?</legend><div class="methods"><label><input type="radio" name="cleanLevel" value="relaxed">Relaxed</label><label><input type="radio" name="cleanLevel" value="balanced" checked>Balanced</label><label><input type="radio" name="cleanLevel" value="high">Very tidy</label></div></fieldset>
    <label class="fld"><span>Quiet hours</span><input class="input" name="quietHours" maxlength="300" placeholder="11 PM–7 AM on weeknights"></label>
    <label class="fld"><span>Guest policy</span><textarea class="input" name="guestPolicy" rows="2" maxlength="300" placeholder="Give the group a heads-up before overnight guests"></textarea></label>
    <label class="fld"><span>Shared supplies</span><textarea class="input" name="sharedSupplies" rows="2" maxlength="300" placeholder="Toilet paper, dish soap, paper towels"></textarea></label>
    <div class="err" role="alert"></div><button class="btn p" type="submit">Suggest a setup</button><p class="hint">Roomie uses a template if AI is unavailable. Nothing is saved yet.</p></form>`);
}

function draftStep() {
  const progress = setupTasks.length ? `<div class="setup-run-status" role="status">${setupError ? esc(setupError) : `Added ${setupDone} of ${setupTasks.length}`}</div>` : '';
  return frame(3, 'Review your starter setup', `${draft.source === 'ai' ? 'AI drafted this' : 'A starter template drafted this'}. Edit anything before it reaches your household.`, `<form class="card stack draft-editor" data-form="onboarding-confirm">
    <h2>Chores</h2>${draft.chores.length ? draft.chores.map((chore, index) => `<fieldset class="draft-item"><legend>Chore ${index + 1}</legend><label class="fld"><span>Name</span><input class="input" name="choreName_${index}" maxlength="120" value="${esc(chore.choreName)}" required></label><label class="fld"><span>Details</span><textarea class="input" name="choreDescription_${index}" maxlength="500" rows="2">${esc(chore.description ?? '')}</textarea></label><div class="inline-grid"><label class="fld"><span>Time</span><input class="input" type="time" name="choreTime_${index}" value="${esc(chore.dueTime)}" required></label><label class="fld"><span>Effort</span><select class="input" name="choreEffort_${index}">${['easy', 'medium', 'hard'].map((effort) => `<option ${chore.effort === effort ? 'selected' : ''}>${effort}</option>`).join('')}</select></label></div>${chore.repeats === 'weekly' ? `<label class="fld"><span>Every</span><select class="input" name="choreDay_${index}">${DAYS.map((day, dayIndex) => `<option value="${dayIndex}" ${chore.dayOfWeek === dayIndex ? 'selected' : ''}>${day}</option>`).join('')}</select></label>` : chore.repeats === 'monthly' ? `<label class="fld"><span>Day of month</span><input class="input" type="number" min="1" max="31" name="choreDay_${index}" value="${chore.dayOfMonth}"></label>` : `<label class="fld"><span>Date</span><input class="input" type="date" name="choreDate_${index}" value="${esc(chore.date)}"></label>`}<label class="chk"><input type="checkbox" name="includeChore" value="${index}" checked> Add this chore</label></fieldset>`).join('') : '<p class="mute">No valid chores were suggested.</p>'}
    <h2>House rules note</h2><label class="fld"><span>Note</span><textarea class="input" name="rulesNote" rows="4" maxlength="500">${esc(draft.rulesNote)}</textarea></label><label class="chk"><input type="checkbox" name="includeRules" checked> Pin this note to the board</label>
    <h2>Shared supplies</h2>${draft.wishlist.map((item, index) => `<div class="draft-item inline-grid"><label class="fld"><span>Item</span><input class="input" name="wishName_${index}" maxlength="120" value="${esc(item.itemName)}"></label><label class="chk"><input type="checkbox" name="includeWish" value="${index}" checked> Add</label></div>`).join('') || '<p class="mute">No shared supplies suggested.</p>'}
    ${progress}<div class="err" role="alert"></div><div class="acts"><button type="button" class="btn" data-action="onboarding-redraft">Start over</button><button class="btn p" type="submit">${setupError ? 'Retry remaining' : 'Add to my house'}</button></div></form>`);
}

async function welcomeStep() {
  if (!welcome) {
    const hid = household().householdId;
    const [memberData, choreData, boardData] = await Promise.all([api(`/households/${hid}/members`), api(`/households/${hid}/chores`), api(`/households/${hid}/board`)]);
    welcome = { members: memberData.members.filter((member) => !member.leftDate), chores: choreData.chores.slice(0, 8), notes: boardData.notes.filter((note) => note.isPinned).slice(0, 3) };
  }
  return frame(3, `Welcome to ${household().householdName}`, 'Here is the quick version of how this household runs.', `<section class="card stack welcome-brief"><h2>Roommates</h2><ul>${welcome.members.map((member) => { const payment = member.paymentMethods?.find((method) => method.isPreferred) ?? member.paymentMethods?.[0]; return `<li><b>${esc(fullName(member))}</b>${payment ? ` · ${esc(payment.app.replace('_', ' '))} ${esc(payment.username)}` : ''}</li>`; }).join('')}</ul><h2>Regular chores</h2>${welcome.chores.length ? `<ul>${welcome.chores.map((chore) => `<li><b>${esc(chore.choreName)}</b> · ${esc(chore.schedule)}</li>`).join('')}</ul>` : '<p class="mute">No recurring chores yet.</p>'}<h2>Pinned house notes</h2>${welcome.notes.length ? `<ul>${welcome.notes.map((note) => `<li>${esc(note.messageText)}</li>`).join('')}</ul>` : '<p class="mute">No pinned rules yet.</p>'}<button class="btn p" data-action="onboarding-next" data-step="5">Continue</button></section>`);
}

function inviteStep() {
  const h = household(), message = `Join ${h.householdName} on Roomie with code ${h.joinCode}`;
  return frame(4, 'Invite your roommates', 'Send the join code now, or copy it for later.', `<section class="card stack invite-card"><span class="eyebrow">Household code</span><div class="onboarding-code">${esc(h.joinCode)}</div><p class="mute">${esc(message)}</p><div class="acts"><button class="btn" data-action="onboarding-copy" data-text="${esc(message)}">Copy message</button><button class="btn" data-action="onboarding-share" data-text="${esc(message)}">Share</button></div><button class="btn p" data-action="onboarding-next" data-step="5">Continue</button></section>`);
}

async function notificationsStep() {
  if (!emailSettings) emailSettings = (await api(`/households/${household().householdId}/notification-settings`)).settings;
  const choices = [['event_hosting', 'New parties and hosting', 'A roommate creates a hosting event.'], ['event_other', 'Other new events', 'A roommate adds a meeting or other event.'], ['approval_request', 'Approval requests', 'An event needs your response.']];
  return frame(5, 'Choose your email updates', 'Everything starts off. Turn on only what would help you.', `<form class="card stack" data-form="onboarding-notifications">${choices.map(([key, title, detail]) => `<label class="toggle-row"><span class="grow"><b>${title}</b><span class="hint">${detail}</span></span><input type="checkbox" name="${key}" ${emailSettings[key] ? 'checked' : ''}></label>`).join('')}<p class="hint">After setup, confirm your notification address from Profile. This is separate from signing in.</p><div class="err" role="alert"></div><button class="btn p" type="submit">Save and continue</button></form>`);
}

function tourStep() {
  const tips = [['Home', 'See this week, house notes, balances, and open requests in one place.'], ['Chores', 'Check your turns, mark work done, or ask to swap.'], ['Finances', 'Split purchases and confirm repayments without a spreadsheet.'], ['Events', 'Plan together and ask roommates before hosting.']];
  return frame(6, 'You are ready', 'A quick map of where everything lives.', `<section class="card stack"><div class="tour-grid">${tips.map(([title, detail]) => `<div class="tour-tip"><b>${title}</b><p class="mute">${detail}</p></div>`).join('')}</div><button class="btn p" data-action="finish-onboarding">Go to Home</button><button class="link-btn" data-action="finish-onboarding">Skip tour</button></section>`);
}

export async function onboardingView() {
  let step = currentStep();
  if (!household() && step > 2) { step = 2; sessionStorage.setItem(STEP_KEY, '2'); }
  if (step === 1) return profileStep();
  if (step === 2) return householdStep();
  if (step === 3) {
    if (draft) return draftStep();
    if (!owner()) {
      const chores = await api(`/households/${household().householdId}/chores`);
      if (chores.chores.length) return welcomeStep();
    }
    return questionsStep();
  }
  if (step === 4) return owner() ? inviteStep() : notificationsStep();
  if (step === 5) return notificationsStep();
  return tourStep();
}

actions['onboarding-back'] = (el) => go(Number(el.dataset.step));
actions['onboarding-next'] = (el) => go(Number(el.dataset.step));
actions['onboarding-redraft'] = () => { draft = null; setupTasks = []; setupDone = 0; setupError = ''; go(3); };
actions['onboarding-copy'] = async (el) => { await navigator.clipboard.writeText(el.dataset.text); toast('Invite copied'); };
actions['onboarding-share'] = async (el) => { if (navigator.share) await navigator.share({ title: 'Join my Roomie household', text: el.dataset.text }); else { await navigator.clipboard.writeText(el.dataset.text); toast('Invite copied'); } };

inputs['onboarding-photo'] = (el) => {
  const file = el.files?.[0]; if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8_000_000) { toast('Choose a JPG, PNG, or WebP under 8 MB.'); el.value = ''; return; }
  const reader = new FileReader(); reader.onload = () => {
    const image = new Image(); image.onload = () => {
      const size = Math.min(image.naturalWidth, image.naturalHeight), sx = (image.naturalWidth - size) / 2, sy = (image.naturalHeight - size) / 2;
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      canvas.getContext('2d').drawImage(image, sx, sy, size, size, 0, 0, 256, 256);
      profilePhoto = canvas.toDataURL('image/jpeg', .82); document.getElementById('onboarding-photo-status').textContent = 'Photo ready';
    }; image.src = String(reader.result);
  }; reader.readAsDataURL(file);
};

forms['onboarding-profile'] = async (form) => {
  const data = new FormData(form), preferred = String(data.get('preferred'));
  const paymentMethods = PAYMENT_APPS.flatMap(([app]) => { const username = String(data.get(`pay_${app}`) ?? '').trim(); return username ? [{ app, username, isPreferred: app === preferred }] : []; });
  try { const saved = await api('/me', { method: 'PATCH', body: { firstName: data.get('firstName'), lastName: data.get('lastName'), phoneNumber: data.get('phoneNumber'), profilePhoto, paymentMethods } }); S.user = saved.user; go(2); }
  catch (error) { showError(form, error.message); }
};

async function joined(result) { S.hid = result.householdId; localStorage.setItem('roomie.hid', String(result.householdId)); sessionStorage.setItem(STEP_KEY, '3'); window.dispatchEvent(new Event('roomie:reload')); }
forms['onboarding-join'] = async (form) => { try { await joined(await api('/households/join', { method: 'POST', body: { joinCode: new FormData(form).get('joinCode') } })); } catch (error) { showError(form, error.message); } };
forms['onboarding-create'] = async (form) => { const data = new FormData(form); try { await joined(await api('/households', { method: 'POST', body: { householdName: data.get('householdName'), address: data.get('address'), timezone: data.get('timezone') } })); } catch (error) { showError(form, error.message); } };

forms['onboarding-suggest'] = async (form) => {
  const data = new FormData(form);
  try { draft = await api(`/households/${household().householdId}/onboarding/suggest`, { method: 'POST', body: { chores: data.getAll('chores'), cleanLevel: data.get('cleanLevel'), quietHours: data.get('quietHours'), guestPolicy: data.get('guestPolicy'), sharedSupplies: data.get('sharedSupplies') } }); go(3); }
  catch (error) { showError(form, error.message); }
};

function collectSetup(form) {
  const data = new FormData(form), hid = household().householdId;
  const tasks = data.getAll('includeChore').map(Number).map((index) => {
    const original = draft.chores[index], body = { ...original, choreName: data.get(`choreName_${index}`), description: String(data.get(`choreDescription_${index}`) ?? '').trim() || null, dueTime: data.get(`choreTime_${index}`), effort: data.get(`choreEffort_${index}`) };
    if (body.repeats === 'weekly') body.dayOfWeek = Number(data.get(`choreDay_${index}`));
    if (body.repeats === 'monthly') body.dayOfMonth = Number(data.get(`choreDay_${index}`));
    if (body.repeats === 'none') body.date = data.get(`choreDate_${index}`);
    return { label: body.choreName, run: () => api(`/households/${hid}/chores`, { method: 'POST', body }) };
  });
  if (data.get('includeRules') && String(data.get('rulesNote')).trim()) tasks.push({ label: 'House rules', run: async () => { const note = await api(`/households/${hid}/board`, { method: 'POST', body: { messageText: data.get('rulesNote') } }); await api(`/households/${hid}/board/${note.messageId}`, { method: 'PATCH', body: { isPinned: true } }); } });
  for (const index of data.getAll('includeWish').map(Number)) { const itemName = String(data.get(`wishName_${index}`) ?? '').trim(); if (itemName) tasks.push({ label: itemName, run: () => api(`/households/${hid}/wishlist`, { method: 'POST', body: { itemName, needOrWant: draft.wishlist[index].needOrWant, description: draft.wishlist[index].description } }) }); }
  return tasks;
}
async function runSetup() {
  setupError = '';
  while (setupDone < setupTasks.length) {
    try { await setupTasks[setupDone].run(); setupDone++; }
    catch (error) { setupError = `Could not add ${setupTasks[setupDone].label}: ${error.message}. Fix it or retry the remaining items.`; go(3); return; }
  }
  draft = null; setupTasks = []; setupDone = 0; go(nextAfterHouseSetup());
}
forms['onboarding-confirm'] = async (form) => { if (!setupTasks.length) setupTasks = collectSetup(form); if (!setupTasks.length) return showError(form, 'Keep at least one item to add.'); await runSetup(); };

forms['onboarding-notifications'] = async (form) => {
  const data = new FormData(form);
  try { const saved = await api(`/households/${household().householdId}/notification-settings`, { method: 'PUT', body: { event_hosting: data.has('event_hosting'), event_other: data.has('event_other'), approval_request: data.has('approval_request') } }); emailSettings = saved.settings; go(6); }
  catch (error) { showError(form, error.message); }
};

actions['finish-onboarding'] = async () => { await api(`/households/${household().householdId}/onboarding/complete`, { method: 'POST' }); sessionStorage.removeItem(STEP_KEY); draft = null; emailSettings = null; welcome = null; location.hash = '#/home'; window.dispatchEvent(new Event('roomie:reload')); };

export const _a = actions;

import { actions, forms, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S } from '../lib/state.js';
import { avatar, closeModal, confirmDialog, esc, mhead, openModal, phead, showError, toast } from '../lib/dom.js';

const PAYMENT_APPS = [['venmo', 'Venmo'], ['zelle', 'Zelle'], ['apple_cash', 'Apple Cash']];
let profileDirty = false;
let photoSelection = 0;

function profileForm() {
  const methods = Object.fromEntries((S.user.paymentMethods ?? []).map((m) => [m.app, m]));
  const preferred = (S.user.paymentMethods ?? []).find((m) => m.isPreferred)?.app ?? 'venmo';
  return `<section class="card profile-card"><div class="row sp"><div><h2>Your profile</h2><p class="body-copy">Help roommates recognize you and know where to send their share.</p></div><div id="profile-avatar">${avatar(S.user, 'lg')}</div></div>
    <form class="stack" data-form="profile" autocomplete="on">
      <div class="inline-grid"><label class="fld"><span>First name</span><input class="input" name="firstName" data-input="profile-dirty" autocomplete="given-name" maxlength="80" required value="${esc(S.user.firstName)}"><small class="field-error" data-error-for="firstName"></small></label>
        <label class="fld"><span>Last name</span><input class="input" name="lastName" data-input="profile-dirty" autocomplete="family-name" maxlength="80" value="${esc(S.user.lastName)}"><small class="field-error" data-error-for="lastName"></small></label></div>
      <div class="inline-grid"><label class="fld"><span>Phone (optional)</span><input class="input" name="phoneNumber" data-input="profile-dirty" type="tel" autocomplete="tel" maxlength="40" value="${esc(S.user.phoneNumber ?? '')}" placeholder="(801) 555-0123"></label>
        <div class="fld"><span>Profile photo (optional)</span><input type="hidden" name="profilePhoto" value="${esc(S.user.profilePhoto ?? '')}"><div class="photo-actions"><label class="btn s photo-pick">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" data-input="profile-file"></label><button type="button" class="btn s" data-action="remove-photo" ${S.user.profilePhoto ? '' : 'disabled'}>Remove</button></div><small class="field-error" data-error-for="profilePhoto"></small></div></div>
      <fieldset class="payment-editor"><legend>Payment apps</legend><p class="hint">Add any handles roommates can use. Leave an app blank to remove it.</p>
        <div class="payment-fields">${PAYMENT_APPS.map(([app, label]) => `<label class="fld"><span>${label}</span><input class="input" data-input="profile-dirty" name="pay_${app}" maxlength="120" value="${esc(methods[app]?.username ?? '')}" placeholder="${app === 'venmo' ? '@username' : 'Phone or email'}"></label>`).join('')}</div>
        <label class="fld preferred-app"><span>Preferred app</span><select class="input" data-input="profile-dirty" name="preferred">${PAYMENT_APPS.map(([app, label]) => `<option value="${app}" ${preferred === app ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      </fieldset>
      <div class="err" role="alert"></div><div class="row sp"><span class="save-status" id="profile-status" role="status" aria-live="polite"></span><button class="btn p" type="submit">Save profile</button></div>
    </form></section>`;
}

export function settingsView() {
  return `
    ${phead('Profile', 'Manage the information your roommates can see.')}

    <div class="stack">
      ${profileForm()}

      <div class="acts" style="justify-content:flex-start">
        <button class="btn d" data-action="signout">Sign out</button>
      </div>
    </div>`;
}

const markProfileDirty = () => {
  profileDirty = true;
  const form = document.querySelector('form[data-form=profile]');
  if (form) { form.dataset.saved = '0'; form.querySelector('[type=submit]').disabled = false; }
  const status = document.getElementById('profile-status'); if (status) status.textContent = 'Unsaved changes';
};
inputs['profile-dirty'] = markProfileDirty;
function openPhotoCrop(image, form) {
  openModal(`${mhead('Crop profile photo')}
    <p class="hint" id="crop-help">Drag the photo or use the arrow keys on the preview to reposition it. Use Zoom to resize it.</p>
    <canvas class="crop-frame" width="256" height="256" tabindex="0" role="img" aria-label="Photo crop preview" aria-describedby="crop-help"></canvas>
    <label class="fld"><span>Zoom</span><input class="input crop-range" type="range" min="1" max="2.5" value="1" step="0.05"></label>
    <div><button type="button" class="btn" data-rotate-crop>Rotate 90°</button></div>
    <div class="acts"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="button" class="btn p" data-apply-crop>Use photo</button></div>`);
  const modal = document.getElementById('modal');
  const canvas = modal.querySelector('.crop-frame');
  const zoom = modal.querySelector('input[type=range]');
  const context = canvas.getContext('2d', { alpha: false });
  let x = image.naturalWidth / 2, y = image.naturalHeight / 2;
  let size, drag, quarterTurns = 0;

  function moveCrop(dx, dy) {
    // Convert movement on the rotated preview back to the original image axes.
    const [sourceX, sourceY] = [[dx, dy], [dy, -dx], [-dx, -dy], [-dy, dx]][quarterTurns];
    x -= sourceX;
    y -= sourceY;
    draw();
  }

  function draw() {
    size = Math.min(image.naturalWidth, image.naturalHeight) / Number(zoom.value);
    const half = size / 2;
    x = Math.max(half, Math.min(x, image.naturalWidth - half));
    y = Math.max(half, Math.min(y, image.naturalHeight - half));
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(quarterTurns * Math.PI / 2);
    context.drawImage(image, x - half, y - half, size, size, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    context.restore();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const scale = size / canvas.getBoundingClientRect().width;
    moveCrop((event.clientX - drag.x) * scale, (event.clientY - drag.y) * scale);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  canvas.addEventListener('keydown', (event) => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    moveCrop(direction[0] * size / 32, direction[1] * size / 32);
  });
  zoom.addEventListener('input', draw);
  modal.querySelector('[data-rotate-crop]').addEventListener('click', () => {
    quarterTurns = (quarterTurns + 1) % 4;
    draw();
  });
  modal.querySelector('[data-apply-crop]').addEventListener('click', () => {
    if (!form.isConnected) { closeModal(); return; }
    const data = canvas.toDataURL('image/jpeg', .82);
    form.elements.namedItem('profilePhoto').value = data;
    document.getElementById('profile-avatar').innerHTML = avatar({ ...S.user, profilePhoto: data }, 'lg');
    form.querySelector('[data-action=remove-photo]').disabled = false;
    markProfileDirty();
    closeModal();
  });
  draw();
}

inputs['profile-file'] = (el) => {
  const file = el.files?.[0]; if (!file) return;
  const selection = ++photoSelection;
  const form = el.closest('form');
  const error = form.querySelector('[data-error-for=profilePhoto]');
  el.value = '';
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10_000_000) { error.textContent = 'Choose a JPG, PNG, or WebP image under 10 MB.'; return; }
  error.textContent = '';
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(url);
    if (form.isConnected && selection === photoSelection) openPhotoCrop(image, form);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    if (form.isConnected && selection === photoSelection) error.textContent = 'Could not open this photo. Try another image.';
  };
  image.src = url;
};
actions['remove-photo'] = (el) => {
  const form = el.closest('form'); form.profilePhoto.value = '';
  document.getElementById('profile-avatar').innerHTML = avatar({ ...S.user, profilePhoto: null }, 'lg'); el.disabled = true; markProfileDirty();
};

window.addEventListener('beforeunload', (event) => { if (profileDirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('click', async (event) => {
  const link = event.target.closest?.('a[href^="#/"]'); if (!profileDirty || !link || link.getAttribute('href') === '#/settings') return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (await confirmDialog('Discard unsaved changes?', 'Your profile edits have not been saved.', 'Discard')) { profileDirty = false; location.hash = link.getAttribute('href'); }
}, true);

forms.profile = async (form) => {
  form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  const data = new FormData(form), preferred = String(data.get('preferred'));
  if (!String(data.get('firstName')).trim()) { form.querySelector('[data-error-for=firstName]').textContent = 'First name is required.'; form.firstName.focus(); return; }
  const paymentMethods = PAYMENT_APPS.flatMap(([app]) => {
    const username = String(data.get(`pay_${app}`) ?? '').trim();
    return username ? [{ app, username, isPreferred: app === preferred }] : [];
  });
  const button = form.querySelector('[type=submit]');
  const controls = [...form.querySelectorAll('input, select, button')].map((el) => [el, el.disabled]);
  controls.forEach(([el]) => { el.disabled = true; });
  button.textContent = 'Saving…';
  try {
    const saved = await api('/me', { method: 'PATCH', body: {
      firstName: data.get('firstName'), lastName: data.get('lastName'), phoneNumber: data.get('phoneNumber'), profilePhoto: data.get('profilePhoto'), paymentMethods,
    } });
    S.user = saved.user; profileDirty = false;
    // Rebuild from the server response so normalized fields and payment preferences are visible.
    form.closest('.profile-card').outerHTML = profileForm();
    document.getElementById('profile-status').textContent = 'Profile saved. All changes are up to date.';
    window.dispatchEvent(new Event('roomie:profile-saved'));
    toast('Profile saved');
  } catch (error) {
    if (/first name/i.test(error.message)) form.querySelector('[data-error-for=firstName]').textContent = error.message;
    else if (/photo/i.test(error.message)) form.querySelector('[data-error-for=profilePhoto]').textContent = error.message;
    else showError(form, error.message);
  } finally {
    controls.forEach(([el, disabled]) => { el.disabled = disabled; });
    button.textContent = 'Save profile';
  }
};

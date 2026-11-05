import { actions, forms, inputs } from '../lib/events.js';
import { api } from '../auth-client.js';
import { S } from '../lib/state.js';
import { avatar, closeModal, confirmDialog, esc, mhead, openModal, phead, showError, toast } from '../lib/dom.js';

const PAYMENT_APPS = [['venmo', 'Venmo'], ['zelle', 'Zelle'], ['apple_cash', 'Apple Cash']];
let profileDirty = false;
let cropImage = null;

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
    ${phead('Your account', 'Profile', 'Manage the information your roommates can see.')}

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
inputs['crop-zoom'] = (el) => { const preview = document.getElementById('crop-preview'); if (preview) preview.style.transform = `scale(${el.value})`; };
inputs['profile-file'] = (el) => {
  const file = el.files?.[0]; if (!file) return;
  const error = document.querySelector('[data-error-for=profilePhoto]');
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10_000_000) { error.textContent = 'Choose a JPG, PNG, or WebP image under 10 MB.'; el.value = ''; return; }
  error.textContent = '';
  const reader = new FileReader();
  reader.onload = () => {
    cropImage = new Image();
    cropImage.onload = () => openModal(`${mhead('Crop profile photo')}<p class="hint">Center your face in the square and adjust the zoom.</p><div class="crop-frame"><img id="crop-preview" src="${esc(reader.result)}" alt="Photo crop preview"></div>
      <label class="fld"><span>Zoom</span><input class="input crop-range" type="range" min="1" max="2.5" value="1" step="0.05" data-input="crop-zoom"></label>
      <div class="acts"><button class="btn" data-action="close-modal">Cancel</button><button class="btn p" data-action="apply-photo">Use photo</button></div>`);
    cropImage.src = reader.result;
  };
  reader.readAsDataURL(file);
};
actions['apply-photo'] = () => {
  if (!cropImage) return;
  const zoom = Number(document.querySelector('[data-input=crop-zoom]')?.value ?? 1), size = Math.min(cropImage.naturalWidth, cropImage.naturalHeight) / zoom;
  const sx = (cropImage.naturalWidth - size) / 2, sy = (cropImage.naturalHeight - size) / 2;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  canvas.getContext('2d').drawImage(cropImage, sx, sy, size, size, 0, 0, 256, 256);
  const data = canvas.toDataURL('image/jpeg', .82), form = document.querySelector('form[data-form=profile]');
  form.profilePhoto.value = data;
  document.getElementById('profile-avatar').innerHTML = avatar({ ...S.user, profilePhoto: data }, 'lg');
  form.querySelector('[data-action=remove-photo]').disabled = false; markProfileDirty(); cropImage = null; closeModal();
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

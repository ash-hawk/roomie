import { actions, forms } from '../lib/events.js';
import { esc, mark, showError } from '../lib/dom.js';
import { requestPasswordReset, resetPassword, signIn, signUp } from '../auth-client.js';
import { meetsPasswordRequirements, PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from '../../shared/password-policy.ts';

let mode = 'signin';
let resetToken = '';

export function isPasswordReset() {
  const url = new URL(location.href);
  if (!url.searchParams.has('reset-password')) return false;
  if (url.searchParams.has('token') || url.searchParams.has('error')) {
    resetToken = url.searchParams.has('error') ? '' : url.searchParams.get('token') || '';
    url.searchParams.delete('token');
    url.searchParams.delete('error');
    history.replaceState(history.state, '', url);
  }
  mode = 'reset';
  return true;
}

const renderAuth = () => window.dispatchEvent(new Event('roomie:render'));

function leaveReset(modeAfterReset) {
  const url = new URL(location.href);
  url.searchParams.delete('reset-password');
  history.replaceState(history.state, '', url);
  resetToken = '';
  mode = modeAfterReset;
  renderAuth();
}

function recoveryForm() {
  if (mode === 'forgot') return `<form class="card stack" data-form="auth-forgot">
    <h2>Reset your password</h2>
    <label class="fld"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
    <div class="err" role="alert"></div>
    <p class="mute" role="status"></p>
    <button class="btn p" type="submit">Send reset link</button>
    <button type="button" class="link-btn" data-action="auth-back">Back to sign in</button>
  </form>`;

  return `<form class="card stack" data-form="auth-reset">
    <h2>Choose a new password</h2>
    ${resetToken ? `<label class="fld"><span>New password</span><input class="input" name="password" type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN_LENGTH}" aria-describedby="password-requirements"></label>
      <p id="password-requirements" class="mute">${PASSWORD_REQUIREMENTS}</p>
      <div class="err" role="alert"></div>
      <button class="btn p" type="submit">Reset password</button>` : '<p class="mute">This reset link is invalid or expired.</p>'}
    <button type="button" class="link-btn" data-action="auth-forgot">Request a new link</button>
    <button type="button" class="link-btn" data-action="auth-back">Back to sign in</button>
  </form>`;
}

export function authView() {
  const up = mode === 'signup';
  return `<div class="onb"><div class="box">
    <div style="text-align:center">${mark('lg')}<h1 style="font-size:30px;font-weight:700;letter-spacing:-.03em;margin-top:14px">Roomie</h1><p class="mute">Chores, costs, and plans for your house.</p></div>
    ${mode === 'forgot' || mode === 'reset' ? recoveryForm() : `<form class="card stack" data-form="auth" autocomplete="on">
      <h2>${up ? 'Create your account' : 'Sign in'}</h2>
      ${up ? `<label class="fld"><span>Your name</span><input class="input" name="name" autocomplete="name" required maxlength="80" placeholder="Alex Rivera"></label>` : ''}
      <label class="fld"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required placeholder="you@school.edu"></label>
      <div class="fld">
        <div class="rowline">
          <label class="mute" for="auth-password">Password</label>
          <button type="button" class="link-btn" data-action="auth-toggle-password" aria-controls="auth-password">Show password</button>
        </div>
        <input id="auth-password" class="input" name="password" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required ${up ? `minlength="${PASSWORD_MIN_LENGTH}" aria-describedby="password-requirements"` : 'placeholder="Enter your password"'}>
        ${up ? `<p id="password-requirements" class="mute">${PASSWORD_REQUIREMENTS}</p>` : ''}
      </div>
      ${up ? '' : '<div><button type="button" class="link-btn" data-action="auth-forgot">Forgot password?</button></div>'}
      ${mode === 'reset-done' ? '<p role="status">Password updated. Sign in with your new password.</p>' : ''}
      <div class="err" role="alert"></div>
      <button class="btn p" type="submit">${up ? 'Create account' : 'Sign in'}</button>
      <p class="mute" style="text-align:center;font-size:14px">${up ? 'Already have an account?' : 'New here?'} <button type="button" class="link-btn" data-action="auth-toggle">${up ? 'Sign in' : 'Create an account'}</button></p>
    </form>`}
  </div></div>`;
}

actions['auth-toggle'] = () => { mode = mode === 'signup' ? 'signin' : 'signup'; renderAuth(); };
actions['auth-forgot'] = () => leaveReset('forgot');
actions['auth-back'] = () => leaveReset('signin');

forms['auth-forgot'] = async (form) => {
  const status = form.querySelector('[role="status"]');
  status.textContent = '';
  const email = String(new FormData(form).get('email')).trim();
  const redirectTo = new URL(location.pathname, location.origin);
  redirectTo.searchParams.set('reset-password', '1');
  try {
    await requestPasswordReset(email, redirectTo.href);
  } catch {
    throw new Error('Could not request a reset link. Please try again.');
  }
  status.textContent = 'If an account exists for that email, you’ll receive a password reset link.';
};

forms['auth-reset'] = async (form) => {
  if (!resetToken) return;
  const password = String(new FormData(form).get('password'));
  if (!meetsPasswordRequirements(password)) return showError(form, PASSWORD_REQUIREMENTS);
  await resetPassword(resetToken, password);
  if (form.isConnected) leaveReset('reset-done');
};

actions['auth-toggle-password'] = (button) => {
  const password = button.form.elements.namedItem('password');
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  button.textContent = show ? 'Hide password' : 'Show password';
};

forms.auth = async (form) => {
  const f = new FormData(form);
  const email = String(f.get('email')).trim(), password = String(f.get('password'));
  if (mode === 'signup' && !meetsPasswordRequirements(password)) return showError(form, PASSWORD_REQUIREMENTS);
  try {
    if (mode === 'signup') await signUp(email, password, String(f.get('name')).trim());
    else await signIn(email, password);
  } catch (e) { return showError(form, e.message || 'Could not sign in'); }
  window.dispatchEvent(new Event('roomie:signedin'));
};

export const _esc = esc; // keep esc imported for future fields

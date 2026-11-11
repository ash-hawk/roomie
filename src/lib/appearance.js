import { S } from './state.js';
import { inputs } from './events.js';

const key = () => S.user ? `roomie.appearance.${S.user.userId}` : 'roomie.appearance.guest';
export function appearance() {
  try { return localStorage.getItem(key()) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
export function applyAppearance() {
  const mode = appearance();
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
  // Accent colors are no longer a household customization.
  document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.removeProperty('--on-accent');
}
inputs.appearance = (el) => {
  if (!['light', 'dark'].includes(el.value) || !el.checked) return;
  try { localStorage.setItem(key(), el.value); } catch { /* Still apply for this session. */ }
  document.documentElement.classList.toggle('dark', el.value === 'dark');
  document.documentElement.style.colorScheme = el.value;
};

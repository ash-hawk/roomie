import { themes, onColor } from './themes.js';
import { S } from './state.js';
import { inputs } from './events.js';

const key = () => S.user ? `roomie.appearance.${S.user.userId}` : 'roomie.appearance.guest';
export const colorModes = { system: 'System', light: 'Light mode', dark: 'Dark mode' };
const systemScheme = window.matchMedia?.('(prefers-color-scheme: dark)');
export function appearance() {
  try {
    const saved = localStorage.getItem(key());
    return Object.hasOwn(colorModes, saved) ? saved : 'system';
  } catch { return 'system'; }
}
export function theme() {
  try { const saved = localStorage.getItem(`roomie.theme.${S.user?.userId ?? 'guest'}`); return Object.hasOwn(themes, saved) ? saved : 'orchid'; }
  catch { return 'orchid'; }
}
export function applyAppearance(preference = appearance(), preset = theme()) {
  const mode = preference === 'system' ? (systemScheme?.matches ? 'dark' : 'light') : preference;
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
  document.documentElement.dataset.theme = preset;
  const colors = themes[preset][mode];
  // All content types share the decorative role until category meanings are designed.
  const accents = Object.fromEntries(['event', 'chore', 'finance', 'announcement'].map(kind => [`color-${kind}`, colors.detail]));
  for (const [token, value] of Object.entries({ ...colors, ...accents })) document.documentElement.style.setProperty(`--${token}`, value);
  for (const kind of ['event', 'chore', 'finance', 'announcement']) document.documentElement.style.setProperty(`--on-${kind}`, onColor(colors.detail));
}

systemScheme?.addEventListener('change', () => {
  if (appearance() === 'system') applyAppearance();
});

inputs.appearance = (el) => {
  if (!Object.hasOwn(colorModes, el.value) || !el.checked) return;
  try { localStorage.setItem(key(), el.value); } catch { /* Still apply for this session. */ }
  applyAppearance(el.value);
};

inputs.theme = (el) => {
  if (!el.checked || !Object.hasOwn(themes, el.value)) return;
  try { localStorage.setItem(`roomie.theme.${S.user?.userId ?? 'guest'}`, el.value); } catch { /* Apply immediately even if persistence is unavailable. */ }
  applyAppearance(appearance(), el.value);
};

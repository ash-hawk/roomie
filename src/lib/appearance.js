import { themes, categoryColors, onColor } from './themes.js';
import { S } from './state.js';
import { inputs } from './events.js';

const key = () => S.user ? `roomie.appearance.${S.user.userId}` : 'roomie.appearance.guest';
export function appearance() {
  try { return localStorage.getItem(key()) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
export function theme() {
  try { const saved = localStorage.getItem(`roomie.theme.${S.user?.userId ?? 'guest'}`); return Object.hasOwn(themes, saved) ? saved : 'coastal'; }
  catch { return 'coastal'; }
}
export function applyAppearance(mode = appearance(), preset = theme()) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
  document.documentElement.dataset.theme = preset;
  const colors = themes[preset][mode];
  for (const [token, value] of Object.entries({ ...colors, ...categoryColors[mode] })) document.documentElement.style.setProperty(`--${token}`, value);
  for (const kind of ['event', 'chore', 'finance', 'announcement']) document.documentElement.style.setProperty(`--on-${kind}`, onColor(categoryColors[mode][`color-${kind}`]));

}
inputs.appearance = (el) => {
  if (!['light', 'dark'].includes(el.value) || !el.checked) return;
  try { localStorage.setItem(key(), el.value); } catch { /* Still apply for this session. */ }
  applyAppearance(el.value);
};

inputs.theme = (el) => {
  if (!el.checked || !Object.hasOwn(themes, el.value)) return;
  try { localStorage.setItem(`roomie.theme.${S.user?.userId ?? 'guest'}`, el.value); } catch { /* Apply immediately even if persistence is unavailable. */ }
  applyAppearance(appearance(), el.value);
};

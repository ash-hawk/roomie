import { themes } from '../lib/themes.js';
import { appearance, theme } from '../lib/appearance.js';
import { phead } from '../lib/dom.js';

export function appearanceView() {
  return `${phead('Appearance')}
    <section class="card stack"><h2>Color mode</h2>
      <div class="appearance-options" role="group" aria-label="Color mode">${['light', 'dark'].map((mode) => `<label class="appearance-choice"><input type="radio" name="appearance" data-input="appearance" value="${mode}" ${appearance() === mode ? 'checked' : ''}><span>${mode === 'light' ? 'Light mode' : 'Dark mode'}</span></label>`).join('')}</div>
    </section>
    <section class="card stack"><h2>Theme preset</h2>
      <div class="theme-options" role="group" aria-label="Theme preset">${Object.entries(themes).map(([id, preset]) => `<label class="theme-choice"><input type="radio" name="theme" data-input="theme" value="${id}" ${theme() === id ? 'checked' : ''}><span class="theme-palette" aria-label="${preset.name} palette">${preset.palette.map(color => `<i style="background:${color}" title="${color}"></i>`).join('')}</span><span class="theme-name">${preset.name}</span><span class="hint">${preset.description}</span><span class="theme-swatches">${[['event', 'Events'], ['chore', 'Chores'], ['finance', 'Finances'], ['announcement', 'Announcements']].map(([kind, label]) => `<span><i style="--swatch-light:${preset.light[`color-${kind}`]};--swatch-dark:${preset.dark[`color-${kind}`]}"></i>${label}</span>`).join('')}</span></label>`).join('')}</div>
    </section>`;
}

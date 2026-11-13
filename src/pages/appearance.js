import { appearance } from '../lib/appearance.js';
import { phead } from '../lib/dom.js';

export function appearanceView() {
  return `${phead('Appearance')}
    <section class="card stack"><h2>Color mode</h2>
      <div class="appearance-options" role="group" aria-label="Color mode">${['light', 'dark'].map((mode) => `<label class="appearance-choice"><input type="radio" name="appearance" data-input="appearance" value="${mode}" ${appearance() === mode ? 'checked' : ''}><span>${mode === 'light' ? 'Light mode' : 'Dark mode'}</span></label>`).join('')}</div>
    </section>`;
}

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { S } from '../src/lib/state.js';
import { inputs } from '../src/lib/events.js';
import { applyAppearance, appearance } from '../src/lib/appearance.js';
beforeEach(() => { localStorage.clear(); S.user = {userId:1}; document.documentElement.className=''; });
describe('personal light and dark appearance', () => {
  it('persists on reload and keeps other users independent', () => {
    inputs.appearance({value:'dark',checked:true});
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyAppearance(); expect(appearance()).toBe('dark');
    S.user = {userId:2}; applyAppearance();
    expect(appearance()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    S.user = {userId:1}; applyAppearance();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it('ignores invalid values and clears the former household accent override', () => {
    inputs.appearance({value:'red',checked:true});
    document.documentElement.style.setProperty('--accent','#ff0000');
    applyAppearance();
    expect(appearance()).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});

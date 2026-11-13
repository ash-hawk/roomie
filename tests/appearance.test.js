// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { themes } from '../src/lib/themes.js';
import { appearanceView } from '../src/pages/appearance.js';
import { S } from '../src/lib/state.js';
import { inputs } from '../src/lib/events.js';
import { applyAppearance, appearance, theme } from '../src/lib/appearance.js';
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
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(themes.coastal.light.accent);
  });
});

describe('personal theme presets', () => {
  it('keeps theme and mode independent, persists them, and isolates accounts', () => {
    inputs.theme({value:'berry',checked:true});
    inputs.appearance({value:'dark',checked:true});
    applyAppearance();
    expect(theme()).toBe('berry');
    expect(document.documentElement.style.getPropertyValue('--color-event')).toBe(themes.berry.dark['color-event']);
    S.user={userId:2};applyAppearance();
    expect(theme()).toBe('coastal');expect(appearance()).toBe('light');
    S.user={userId:1};applyAppearance();
    expect(theme()).toBe('berry');expect(appearance()).toBe('dark');
    inputs.appearance({value:'light',checked:true});
    expect(theme()).toBe('berry');
    expect(document.documentElement.style.getPropertyValue('--color-event')).toBe(themes.berry.light['color-event']);
  });
  it('falls back safely for invalid stored themes and ignores invalid selections', () => {
    localStorage.setItem('roomie.theme.1','bad-theme');
    inputs.theme({value:'__proto__',checked:true});applyAppearance();
    expect(theme()).toBe('coastal');
    document.body.innerHTML=appearanceView();
    expect(document.querySelectorAll('[data-input=theme]')).toHaveLength(3);
    expect(document.querySelector('[data-input=theme]:checked').value).toBe('coastal');
    expect(document.querySelectorAll('.theme-swatches i')).toHaveLength(12);
  });
  it('provides readable text and distinct category accents in all six combinations', () => {
    const luminance=hex=>{
      const channels=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
      return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
    };
    const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
    for(const preset of Object.values(themes)) for(const mode of ['light','dark']) {
      const colors=preset[mode];
      for(const surface of ['card','bg']) for(const text of ['ink','mute']) expect(contrast(colors[surface],colors[text]),`${preset.name} ${mode} ${surface}/${text}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.accent,colors['on-accent'])).toBeGreaterThanOrEqual(4.5);
      const categories=['event','chore','finance','announcement'].map(kind=>colors[`color-${kind}`]);
      expect(new Set(categories).size).toBe(4);
      for(const color of categories) expect(contrast(color,colors.card)).toBeGreaterThanOrEqual(3);
    }
  });
});

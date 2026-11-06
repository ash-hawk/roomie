// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { connectHomeLayout, fitHomeWidgets } from '../src/components/home-layout.js';
afterEach(() => { document.body.innerHTML = ''; connectHomeLayout(); vi.unstubAllGlobals(); });
it('sizes separate widget tracks and remeasures expanded content without forcing equal card heights', () => {
  document.body.innerHTML = '<div class="home-dashboard" style="grid-auto-rows:2px;column-gap:18px"><div class="home-widget"></div><div class="home-widget"></div><div class="home-widget"></div></div>';
  const grid = document.querySelector('.home-dashboard');
  const heights = [1000, 200, 100];
  [...grid.children].forEach((widget, i) => { widget.getBoundingClientRect = () => ({ height: heights[i] }); });
  let changed;
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { changed = callback; } observe() {} disconnect() { disconnect(); } });
  connectHomeLayout();
  expect([...grid.children].map((w) => w.style.gridRowEnd)).toEqual(['span 509', 'span 109', 'span 59']);
  heights[1] = 320; changed();
  expect(grid.children[1].style.gridRowEnd).toBe('span 169');
  expect(grid.children[2].style.gridRowEnd).toBe('span 59');
  grid.style.gridAutoRows = 'auto'; fitHomeWidgets(grid);
  expect([...grid.children].every((w) => w.style.gridRowEnd === '')).toBe(true);
  document.body.innerHTML = ''; connectHomeLayout();
  expect(disconnect).toHaveBeenCalledOnce();
});

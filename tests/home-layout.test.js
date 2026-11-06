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

it('infers narrow, wide and empty spaces from the destination rather than a size toggle', async () => {
  const { widgetDropSlot } = await import('../src/components/home-layout.js');
  const bounds = { left: 0, right: 900, width: 900 };
  const widgets = [
    { id: 'schedule', left: 0, right: 600, top: 0, bottom: 900, column: 1, span: 2 },
    { id: 'board', left: 600, right: 900, top: 0, bottom: 300, column: 3, span: 1 },
    { id: 'finances', left: 600, right: 900, top: 310, bottom: 510, column: 3, span: 1 },
  ];
  expect(widgetDropSlot(bounds, widgets, 'finances', 200, 100, 3)).toEqual({ column: 1, span: 2, targetId: 'schedule' });
  expect(widgetDropSlot(bounds, widgets, 'schedule', 800, 100, 3)).toEqual({ column: 3, span: 1, targetId: 'board' });
  expect(widgetDropSlot(bounds, widgets, 'finances', 800, 700, 3)).toEqual({ column: 3, span: 1, targetId: null });
  expect(widgetDropSlot(bounds, widgets, 'finances', 200, 1000, 3)).toEqual({ column: 1, span: 2, targetId: null });
  expect(widgetDropSlot(bounds, widgets, 'finances', -1, 100, 3)).toBeNull();
  expect(widgetDropSlot({ left: 0, right: 320, width: 320 }, [], 'schedule', 100, 100, 1)).toEqual({ column: 1, span: 1, targetId: null });
});

// Presets choose widths; measured content heights let shorter tiles nest without blank rows.
export const HOME_PRESETS = ['focus-left', 'equal', 'focus-right'];
export function normalizeHomeLayout(widgets, preset = 'focus-left') {
  const ids = widgets.map((widget) => typeof widget === 'string' ? widget : widget.id);
  return ids.map((id, index) => ({ id, size: preset !== 'equal' && index === 0 ? 'expanded' : 'compact' }));
}
export function fitHomeWidgets(target = document.querySelector('.home-dashboard')) {
  if (!target?.isConnected) return;
  for (const [index, widget] of [...target.children].entries()) {
    widget.style.removeProperty('grid-column');
    widget.style.removeProperty('grid-row-end');
    widget.querySelector(':scope > .card')?.setAttribute('tabindex', '0');
    widget.dataset.slot = ['primary', 'secondary', 'tertiary'][index];
    const heading = widget.querySelector('h2');
    if (!heading) continue;
    if (widget.dataset.editing === 'true') {
      heading.dataset.widgetDrag = widget.dataset.widget;
      heading.tabIndex = 0; heading.setAttribute('role', 'button');
      heading.setAttribute('aria-label', `Move ${widget.dataset.widget === 'board' ? 'Household board' : widget.dataset.widget === 'schedule' ? 'Schedule' : 'Finances'}`);
    } else {
      delete heading.dataset.widgetDrag; heading.removeAttribute('tabindex');
      heading.removeAttribute('role'); heading.removeAttribute('aria-label');
    }
  }
}
let resizeObserver, contentObserver, frame;
export function connectHomeLayout() {
  resizeObserver?.disconnect(); contentObserver?.disconnect(); cancelAnimationFrame(frame);
  const target = document.querySelector('.home-dashboard');
  if (!target) return;
  const fit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => fitHomeWidgets(target)); };
  const observeCards = () => {
    resizeObserver?.disconnect();
    for (const card of target.querySelectorAll('.home-widget > .card')) resizeObserver?.observe(card);
    fit();
  };
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(fit);
  contentObserver = new MutationObserver(observeCards);
  contentObserver.observe(target, { childList: true, subtree: true });
  observeCards(); fitHomeWidgets(target);
}
window.addEventListener('resize', () => fitHomeWidgets());

// Measure each widget independently so short cards can fill space beside tall ones.
let grid = null, observer = null;
export function fitHomeWidgets(target = grid) {
  if (!target?.isConnected) return;
  const styles = getComputedStyle(target);
  const row = Number.parseFloat(styles.gridAutoRows);
  const gutter = Number.parseFloat(styles.columnGap) || 18;
  for (const widget of target.children) {
    if (!widget.classList.contains('home-widget')) continue;
    // Narrow screens use ordinary document flow in the saved reading order.
    widget.style.gridRowEnd = row > 0 ? `span ${Math.max(1, Math.ceil((widget.getBoundingClientRect().height + gutter) / row))}` : '';
  }
}
export function connectHomeLayout() {
  observer?.disconnect(); observer = null;
  grid = document.querySelector('.home-dashboard');
  if (!grid) return;
  fitHomeWidgets();
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => fitHomeWidgets());
    // Handles opened board entries, reply drafts, font loading and width changes.
    for (const widget of grid.children) observer.observe(widget);
  }
}
window.addEventListener('resize', () => fitHomeWidgets());

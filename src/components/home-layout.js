// Measure each widget independently so short cards can fill space beside tall ones.
let grid = null, observer = null;
export function fitHomeWidgets(target = grid) {
  if (!target?.isConnected) return;
  const styles = getComputedStyle(target);
  const row = Number.parseFloat(styles.gridAutoRows);
  const gutter = Number.parseFloat(styles.columnGap) || 18;
  const columns = styles.gridTemplateColumns.split(' ').filter(Boolean).length;
  for (const widget of target.children) {
    if (!widget.classList.contains('home-widget')) continue;
    const heading = widget.querySelector('h2');
    if (heading) {
      if (widget.dataset.editing === 'true') {
        heading.dataset.widgetDrag = widget.dataset.widget;
        heading.tabIndex = 0; heading.setAttribute('role', 'button');
        heading.setAttribute('aria-label', `Move ${widget.dataset.widget === 'board' ? 'Household board' : widget.dataset.widget === 'schedule' ? 'Schedule' : 'Finances'}`);
      } else {
        delete heading.dataset.widgetDrag; heading.removeAttribute('tabindex');
        heading.removeAttribute('role'); heading.removeAttribute('aria-label');
      }
    }
    const span = Math.min(columns, widget.classList.contains('expanded') ? 2 : 1);
    const preferred = Number(widget.dataset.column);
    widget.style.gridColumn = row > 0 && preferred > 0 ? `${Math.min(preferred, columns - span + 1)} / span ${span}` : '';
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

// Resolve the width of the space under the pointer, excluding the moving widget.
export function widgetDropSlot(bounds, widgets, sourceId, x, y, columns) {
  if (!(bounds.width > 0) || x < bounds.left || x > bounds.right) return null;
  const lane = Math.min(columns - 1, Math.max(0, Math.floor((x - bounds.left) / bounds.width * columns)));
  const others = widgets.filter((w) => w.id !== sourceId);
  const hit = others.find((w) => x >= w.left && x <= w.right && y >= w.top && y <= w.bottom);
  if (hit) return { column: hit.column, span: hit.span, targetId: hit.id };
  const occupied = new Set();
  for (const widget of others.filter((w) => y >= w.top && y <= w.bottom)) {
    for (let i = widget.column; i < widget.column + widget.span; i++) occupied.add(i);
  }
  if (occupied.has(lane + 1)) return null;
  let left = lane + 1, right = lane + 1;
  while (left > 1 && !occupied.has(left - 1)) left--;
  while (right < columns && !occupied.has(right + 1)) right++;
  const span = Math.min(2, right - left + 1);
  const column = Math.min(Math.max(left, lane + 1), right - span + 1);
  const below = others.filter((w) => w.top > y && w.column <= column + span - 1 && w.column + w.span > column).sort((a, b) => a.top - b.top)[0];
  return { column, span, targetId: below?.id ?? null };
}

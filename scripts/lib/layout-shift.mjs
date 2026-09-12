/**
 * How far a page moves while it loads, from a PerformanceObserver on `layout-shift` (#74).
 *
 * Core Web Vitals rate a cumulative layout shift above 0.1 as needing improvement, and every layout
 * used to move its first screen by far more: Nerd Mode's plain CV painted before its editor replaced
 * it, the default layout's containers painted before the renderers filled or hid them.
 *
 * The screen audit records every shift from navigation until the fonts are ready and adds them all. The
 * sum is never less than the session-window CLS a browser reports, so a page under the ceiling here is
 * under it there. It also counts the entries flagged `hadRecentInput`, which CLS leaves out: an emulated
 * phone flags every shift of a load that way though nothing touched the page, and leaving them out read
 * Nerd Mode's jump of 1.0 at 390px as no shift at all.
 */
export const LAYOUT_SHIFT_CEILING = 0.1;

/**
 * Runs in the page before any script of its own, and keeps each shift as plain data a DevTools
 * evaluation can hand back: its score and, for every element it moved, where it was and where it went.
 */
export const RECORD_LAYOUT_SHIFTS = `(() => {
  window.__layoutShifts = [];
  const named = (node) =>
    !node
      ? '(removed)'
      : node.nodeName.toLowerCase() +
        (node.id ? '#' + node.id : '') +
        (typeof node.className === 'string' && node.className.trim()
          ? '.' + node.className.trim().split(/\\s+/).join('.')
          : '');
  const box = (rect) => [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(',');
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__layoutShifts.push({
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        sources: entry.sources.map(
          (source) => named(source.node) + ' ' + box(source.previousRect) + ' → ' + box(source.currentRect)
        )
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
})();`;

/**
 * The shifts of one load, added up and judged.
 * @param {{ value: number, sources: string[] }[]} entries - What `RECORD_LAYOUT_SHIFTS` kept
 * @returns {{ total: number, holdsStill: boolean, moved: string[] }} The sum, whether it stays under
 *   the ceiling, and every element a shift that counted moved
 */
export function layoutShift(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return {
    total,
    holdsStill: total < LAYOUT_SHIFT_CEILING,
    moved: entries.filter((entry) => entry.value > 0).flatMap((entry) => entry.sources)
  };
}

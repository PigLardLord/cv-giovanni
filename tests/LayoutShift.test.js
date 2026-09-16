/**
 * @jest-environment node
 */
import {
  LAYOUT_SHIFT_CEILING,
  RECORD_LAYOUT_SHIFTS,
  layoutShift
} from '../scripts/lib/layout-shift.mjs';

// What the recorder hands the screen audit from a PerformanceObserver on `layout-shift`, as plain data:
// each entry's score and, for every element it moved, where it was and where it went (#74).
const entry = (value, sources = [], hadRecentInput = false) => ({ value, hadRecentInput, sources });

describe('the layout shift a page records while it loads', () => {
  test('is every shift added together', () => {
    expect(layoutShift([entry(0.391), entry(0.495)]).total).toBeCloseTo(0.886, 3);
  });

  // An emulated phone flags every shift of the load as following input, though nothing touched the
  // page. Leaving those out read Nerd Mode's jump of 1.0 at 390px as no shift at all.
  test('counts the shifts a browser flags as following input', () => {
    expect(layoutShift([entry(1, [], true)]).total).toBe(1);
  });

  test('holds still below 0.1, where Core Web Vitals stop rating a shift good', () => {
    expect(LAYOUT_SHIFT_CEILING).toBe(0.1);
    expect(layoutShift([]).holdsStill).toBe(true);
    expect(layoutShift([entry(0.099)]).holdsStill).toBe(true);
    expect(layoutShift([entry(0.07), entry(0.05)]).holdsStill).toBe(false);
  });

  test('names what moved, so a failure says where to look', () => {
    const { moved } = layoutShift([
      entry(0.694, ['div.container 157,72,966,828 → 0,0,0,0']),
      entry(0, ['p#profile.hero-summary 38,520,313,311 → 38,475,313,311'])
    ]);

    expect(moved).toEqual(['div.container 157,72,966,828 → 0,0,0,0']);
  });

  // The recorder runs in the page, where no unit test reaches it, so here it runs against a stand-in
  // PerformanceObserver. Compiled and never run, as this test once had it, a recorder watching the wrong entry
  // type passed (#126).
  const record = (source) => {
    const page = { window: {} };
    new Function('window', 'PerformanceObserver', source)(
      page.window,
      class {
        constructor(report) {
          page.report = report;
        }

        observe(options) {
          page.observed = options;
        }
      }
    );
    return page;
  };
  // A shift the browser reports is often of an element removed since, and rarely sits on whole pixels; and a load reports
  // its shifts over several callbacks. The code review of #132 found three broken recorders a simpler fixture passed.
  const removed = {
    value: 0.05,
    hadRecentInput: false,
    sources: [
      {
        node: null,
        previousRect: { x: 10, y: 10, width: 50, height: 50 },
        currentRect: { x: 0, y: 0, width: 50, height: 50 }
      }
    ]
  };
  const moved = {
    value: 0.694,
    hadRecentInput: true,
    sources: [
      {
        node: { nodeName: 'DIV', id: '', className: 'container' },
        previousRect: { x: 157.4, y: 72.6, width: 966, height: 828 },
        currentRect: { x: 0, y: 0, width: 0, height: 0 }
      }
    ]
  };

  test('is recorded by a script a page runs before its own: every shift, buffered, as plain data', () => {
    const page = record(RECORD_LAYOUT_SHIFTS);
    expect(page.observed).toEqual({ type: 'layout-shift', buffered: true });

    page.report({ getEntries: () => [moved, removed] });
    page.report({ getEntries: () => [removed] });
    expect(page.window.__layoutShifts).toEqual([
      { value: 0.694, hadRecentInput: true, sources: ['div.container 157,73,966,828 → 0,0,0,0'] },
      { value: 0.05, hadRecentInput: false, sources: ['(removed) 10,10,50,50 → 0,0,50,50'] },
      { value: 0.05, hadRecentInput: false, sources: ['(removed) 10,10,50,50 → 0,0,50,50'] }
    ]);
  });

  test.each([
    ['another entry type', (source) => source.replace("type: 'layout-shift'", "type: 'paint'")],
    ['no buffer', (source) => source.replace(', buffered: true', '')]
  ])('a recorder with %s is caught', (what, change) => {
    const changed = change(RECORD_LAYOUT_SHIFTS);
    expect(changed).not.toBe(RECORD_LAYOUT_SHIFTS);
    expect(record(changed).observed).not.toEqual({ type: 'layout-shift', buffered: true });
  });
});

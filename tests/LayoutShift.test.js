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

  test('is recorded by a script a page can run before its own', () => {
    expect(() => new Function(RECORD_LAYOUT_SHIFTS)).not.toThrow();
  });
});

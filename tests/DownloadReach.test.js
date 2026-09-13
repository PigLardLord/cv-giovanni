import {
  contrast,
  downloadReach,
  RING_MINIMUM,
  TAP_TARGET
} from '../scripts/lib/download-reach.mjs';

// The product reviews of #59 measured the Download PDF link by hand: hidden with no PDF behind it, on the first
// screen, tappable on a phone, and a focus ring a keyboard user can see. The screen audit now measures the same
// things on every render; these are its judgements, on measurements taken from the page #59 left (#101).
const phone = { width: 390, height: 844, mobile: true };
const desktop = { width: 1280, height: 900, mobile: false };
const measured = {
  links: [
    { place: 'top', display: 'flex', top: 97, bottom: 141, height: 44 },
    { place: 'footer', display: 'inline-flex', top: 5376, bottom: 5431, height: 55 }
  ],
  withoutPdf: [
    { place: 'top', display: 'none' },
    { place: 'footer', display: 'none' }
  ],
  afterScroll: null,
  focus: {
    focused: true,
    style: 'solid',
    width: 2,
    ring: 'rgb(138, 47, 15)',
    behind: 'rgb(239, 230, 219)'
  }
};
const withTop = (change) => ({
  ...measured,
  links: [{ ...measured.links[0], ...change }, measured.links[1]]
});

describe('the contrast of two colours', () => {
  test.each([
    ['rgb(0, 0, 0)', 'rgb(255, 255, 255)', 21],
    ['rgb(138, 47, 15)', 'rgb(239, 230, 219)', 6.82],
    ['rgb(232, 100, 31)', 'rgb(239, 230, 219)', 2.71]
  ])('%s on %s is %s:1', (first, second, ratio) => {
    expect(contrast(first, second)).toBeCloseTo(ratio, 1);
  });
});

describe('the Download link on one render', () => {
  test('passes on the page #59 left', () => {
    expect(downloadReach(measured, phone).checks).toEqual({
      hiddenWithoutPdf: true,
      reachable: true,
      tappable: true,
      visibleFocus: true
    });
  });

  test('a copy that still shows with no PDF behind it fails', () => {
    const shown = {
      ...measured,
      withoutPdf: [
        { place: 'top', display: 'none' },
        { place: 'footer', display: 'inline-flex' }
      ]
    };
    const { checks, findings } = downloadReach(shown, phone);

    expect(checks.hiddenWithoutPdf).toBe(false);
    expect(findings.shownWithoutPdf).toEqual([
      'the footer copy computes display: inline-flex with no PDF'
    ]);
  });

  test('a top copy off the first screen fails, and so does a pinned one lost by scrolling', () => {
    expect(downloadReach(withTop({ top: 880, bottom: 924 }), phone).checks.reachable).toBe(false);
    expect(downloadReach(withTop({ display: 'none' }), phone).checks.reachable).toBe(false);
    expect(
      downloadReach({ ...measured, afterScroll: { inViewport: true, topmost: false } }, desktop)
        .checks.reachable
    ).toBe(false);
    expect(
      downloadReach({ ...measured, afterScroll: { inViewport: true, topmost: true } }, desktop)
        .checks.reachable
    ).toBe(true);
  });

  test(`on a phone, a top copy that does not render ${TAP_TARGET}px, or any copy under it, fails`, () => {
    expect(TAP_TARGET).toBe(44);
    expect(downloadReach(withTop({ height: 55 }), phone).checks.tappable).toBe(false);
    const small = { ...measured, links: [measured.links[0], { ...measured.links[1], height: 39 }] };
    expect(downloadReach(small, phone).checks.tappable).toBe(false);
    expect(downloadReach(withTop({ height: 55 }), desktop).checks.tappable).toBe(true);
  });

  test('a focus ring under 3:1 against what is behind it fails, and so does no focus at all', () => {
    expect(RING_MINIMUM).toBe(3);
    const faint = { ...measured, focus: { ...measured.focus, ring: 'rgb(232, 100, 31)' } };
    const { checks, findings } = downloadReach(faint, phone);

    expect(checks.visibleFocus).toBe(false);
    expect(findings.faintFocus).toEqual([
      'its ring rgb(232, 100, 31) on rgb(239, 230, 219) is 2.71:1'
    ]);
    expect(
      downloadReach({ ...measured, focus: { ...measured.focus, focused: false } }, phone).checks
        .visibleFocus
    ).toBe(false);
  });

  test('a ring that is not drawn fails, whatever its colour', () => {
    const undrawn = { ...measured, focus: { ...measured.focus, style: 'none', width: 0 } };
    const { checks, findings } = downloadReach(undrawn, phone);

    expect(checks.visibleFocus).toBe(false);
    expect(findings.faintFocus).toEqual(['no ring is drawn: outline-style none, 0px wide']);
  });

  // A score says a check passed; the numbers say by how much, and they are what the next review compares.
  test('what it measured goes to the report', () => {
    expect(downloadReach(measured, phone).measures).toEqual({
      top: '97–141px',
      heights: '44 · 55px',
      ring: '6.82:1'
    });
    const nothing = downloadReach({ links: [], withoutPdf: [], focus: { focused: false } }, phone);
    expect(nothing.measures).toEqual({ top: '—', heights: '—', ring: '—' });
  });
});

import {
  composite,
  contrast,
  downloadReach,
  RING_MINIMUM,
  TAP_TARGET
} from '../scripts/lib/download-reach.mjs';

// The product reviews of #59 measured the Download PDF link by hand: hidden with no PDF behind it, on the first
// screen, tappable on a phone, and a focus ring a keyboard user can see. The screen audit now measures the same
// things on every render; these are its judgements, on measurements taken from the page #150 left, where the link
// at the top is the page's one download control.
const phone = { width: 390, height: 844, mobile: true };
const desktop = { width: 1280, height: 900, mobile: false };
const measured = {
  links: [
    {
      place: 'top',
      display: 'flex',
      top: 97,
      bottom: 141,
      left: 16,
      right: 374,
      height: 44,
      lines: 1
    }
  ],
  withoutPdf: [{ place: 'top', display: 'none' }],
  afterScroll: null,
  focus: {
    focused: true,
    style: 'solid',
    width: 2,
    ring: 'rgb(138, 47, 15)',
    behind: 'rgb(239, 230, 219)'
  }
};
const withTop = (change) => ({ ...measured, links: [{ ...measured.links[0], ...change }] });
/** A second copy of the link, as the footer carried one until #150. */
const footerCopy = {
  place: 'footer',
  display: 'inline-flex',
  top: 5376,
  bottom: 5420,
  left: 37,
  right: 353,
  height: 44,
  lines: 1
};
const withFooter = (change = {}) => ({
  ...measured,
  links: [measured.links[0], { ...footerCopy, ...change }]
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

describe('a colour painted over another', () => {
  test.each([
    ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(255, 255, 255)'],
    ['rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)', 'rgb(128, 128, 128)'],
    ['rgb(138, 47, 15)', 'rgb(239, 230, 219)', 'rgb(138, 47, 15)']
  ])('%s over %s is painted %s', (over, under, painted) => {
    expect(composite(over, under)).toBe(painted);
  });
});

describe('the Download link on one render', () => {
  test('passes on the page #150 left', () => {
    expect(downloadReach(measured, phone).checks).toEqual({
      hiddenWithoutPdf: true,
      reachable: true,
      tappable: true,
      visibleFocus: true,
      labelOnOneLine: true,
      oneControl: true
    });
  });

  test('a copy that still shows with no PDF behind it fails', () => {
    const shown = { ...measured, withoutPdf: [{ place: 'top', display: 'flex' }] };
    const { checks, findings } = downloadReach(shown, phone);

    expect(checks.hiddenWithoutPdf).toBe(false);
    expect(findings.shownWithoutPdf).toEqual(['the top copy computes display: flex with no PDF']);
  });

  // #150: the page offered the PDF from the toolbar and again from the footer, beside Browser print. The owner chose
  // one control; a second copy that comes back fails, wherever it shows.
  test('a page that shows the link more than once fails', () => {
    const { checks, findings } = downloadReach(withFooter(), desktop);

    expect(checks.oneControl).toBe(false);
    expect(findings.extraControls).toEqual(['the page shows 2 download controls: top, footer']);
  });

  test('a copy the page hides is not a control it shows', () => {
    const hidden = withFooter({ display: 'none' });

    expect(downloadReach(hidden, desktop).checks.oneControl).toBe(true);
    expect(downloadReach(hidden, desktop).findings.extraControls).toEqual([]);
  });

  // No control at all is not this check's to report: the top copy is then not on the first screen, and reachable
  // already fails the render and says so. Reported twice, one missing link would read as two defects.
  test('a page that shows no copy fails as unreachable, and only there', () => {
    const { checks, findings } = downloadReach(withTop({ display: 'none' }), desktop);

    expect(checks.reachable).toBe(false);
    expect(findings.unreachable).toEqual(['no top copy shows']);
    expect(checks.oneControl).toBe(true);
  });

  test('with no PDF offered, the copies the page hides are not counted', () => {
    const withoutPdf = [
      { place: 'top', display: 'none' },
      { place: 'footer', display: 'none' }
    ];

    expect(downloadReach({ ...measured, withoutPdf }, phone).checks.oneControl).toBe(true);
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
    expect(downloadReach(withFooter({ height: 39 }), phone).checks.tappable).toBe(false);
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
      controls: '1',
      top: '97–141px',
      heights: '44px',
      lines: '1',
      ring: '6.82:1'
    });
    expect(downloadReach(withFooter(), phone).measures).toMatchObject({
      controls: '2',
      heights: '44 · 44px',
      lines: '1 · 1'
    });
    const nothing = downloadReach({ links: [], withoutPdf: [], focus: { focused: false } }, phone);
    expect(nothing.measures).toEqual({
      controls: '0',
      top: '—',
      heights: '—',
      lines: '—',
      ring: '—'
    });
  });

  // #107: on a phone the footer's buttons broke "Download PDF" in two, and the button grew to 78px: tall enough
  // to tap, so no height check saw it.
  test('a copy that breaks its label onto a second line fails, at any width', () => {
    const broken = withTop({ height: 78, lines: 2 });
    const { checks, findings } = downloadReach(broken, desktop);

    expect(checks.labelOnOneLine).toBe(false);
    expect(findings.brokenLabel).toEqual(['the top copy breaks its label onto 2 lines']);
    expect(downloadReach(withFooter({ height: 78, lines: 2 }), phone).checks.tappable).toBe(true);
  });

  test('a copy that shows with no label rendered fails too', () => {
    expect(downloadReach(withTop({ lines: 0 }), phone).findings.brokenLabel).toEqual([
      'the top copy renders no label'
    ]);
  });

  // The code review of #108 found the next four: each check could pass on a page that fails it.
  test('a ring painted fully transparent is no ring, and a translucent one is judged as it is painted', () => {
    const invisible = {
      ...measured,
      focus: { ...measured.focus, ring: 'rgba(0, 0, 0, 0)', behind: 'rgb(255, 255, 255)' }
    };
    expect(downloadReach(invisible, phone).checks.visibleFocus).toBe(false);
    expect(downloadReach(invisible, phone).findings.faintFocus).toEqual([
      'its ring rgba(0, 0, 0, 0) on rgb(255, 255, 255) is 1.00:1'
    ]);
    const faded = { ...measured, focus: { ...measured.focus, ring: 'rgba(138, 47, 15, 0.3)' } };
    expect(downloadReach(faded, phone).checks.visibleFocus).toBe(false);
  });

  test('a top copy that runs off the side of the screen is not reachable', () => {
    const clipped = withTop({ left: 1200, right: 1300 });
    expect(downloadReach(clipped, desktop).checks.reachable).toBe(false);
    expect(downloadReach(clipped, desktop).findings.unreachable).toEqual([
      'the top copy spans 1200–1300px across a 1280px screen'
    ]);
    expect(downloadReach(withTop({ left: -4, right: 354 }), phone).checks.reachable).toBe(false);
  });

  test('a measurement is judged as measured, a finding says it as measured, and only the table rounds it', () => {
    expect(downloadReach(withTop({ height: 45.4 }), phone).findings.untappable).toEqual([
      'the top copy renders 45.4px, not 44'
    ]);
    expect(downloadReach(withFooter({ height: 42.6 }), phone).findings.untappable).toEqual([
      'the footer copy renders 42.6px'
    ]);
    expect(downloadReach(withTop({ height: 44.6 }), phone).checks.tappable).toBe(true);
    expect(
      downloadReach(withTop({ top: 97.4, bottom: 141.4, height: 44 }), phone).measures.top
    ).toBe('97–141px');
  });

  // The re-review of #108's fix: rounding had given the screen's edges half a pixel of slack, and judging
  // unrounded took it away, so a copy 0.4px past the bottom of a sound page was off the screen.
  test('a copy less than a pixel past an edge of the screen is on it, and a pixel past is not', () => {
    const tall = { ...phone, height: 900 };
    expect(downloadReach(withTop({ top: 856.4, bottom: 900.4 }), tall).checks.reachable).toBe(true);
    expect(downloadReach(withTop({ left: -0.6, right: 357.4 }), phone).checks.reachable).toBe(true);
    expect(downloadReach(withTop({ top: 857, bottom: 901 }), tall).findings.unreachable).toEqual([
      'the top copy spans 857–901px of a 900px screen'
    ]);
    expect(
      downloadReach(withTop({ left: 16.25, right: 391.25 }), phone).findings.unreachable
    ).toEqual(['the top copy spans 16.25–391.25px across a 390px screen']);
  });
});

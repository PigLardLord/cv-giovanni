import { currentLayoutMarked, forcedBoundaries } from '../scripts/lib/forced-colours.mjs';

// In a contrast theme a browser drops fills, shadows and background images, and keeps border styles. Impact Spotlight
// and Technical Profile marked Download PDF as a button by its fill and its shadow alone, so there it showed as bare
// text (#119). Measured with forced colours emulated. The footer's Browser print went with the footer (#150), and
// with it the rule that held the primary's border to no thinner than the secondary's.
const control = (place, label, borderStyle, borderWidth) => ({
  place,
  label,
  display: 'flex',
  borderStyle,
  borderWidth
});
const asItWas = [control('top', '↓ Download PDF', 'none', '0px')];

describe('the Download control in forced colours', () => {
  test('a control marked by its fill and shadow alone has no border there, and fails', () => {
    const { checks, findings, measures } = forcedBoundaries(asItWas);

    expect(checks.boundedInForcedColours).toBe(false);
    expect(findings.unboundedInForcedColours).toEqual([
      'the top copy draws no border in forced colours'
    ]);
    expect(measures.forced).toBe('0px');
  });

  test('a control that keeps a border there passes', () => {
    expect(forcedBoundaries([control('top', '↓ Download PDF', 'solid', '3px')])).toEqual({
      checks: { boundedInForcedColours: true },
      findings: { unboundedInForcedColours: [] },
      measures: { forced: '3px' }
    });
  });

  test('every shown control is judged, and each unbordered one is named', () => {
    const two = [
      control('top', '↓ Download PDF', 'solid', '3px'),
      control('toolbar', '↓ Download PDF', 'none', '0px')
    ];

    expect(forcedBoundaries(two).findings.unboundedInForcedColours).toEqual([
      `the toolbar's "↓ Download PDF" draws no border in forced colours`
    ]);
  });

  // With one control there is no lesser action for it to out-draw: any border marks it as a button (#150).
  test("no control is held to another one's border width", () => {
    const asMeasuredBefore = [
      { ...control('top', '↓ Download PDF', 'solid', '1px'), primary: true },
      { ...control('footer', 'Browser print', 'solid', '2px'), primary: false }
    ];

    expect(forcedBoundaries(asMeasuredBefore).checks.boundedInForcedColours).toBe(true);
  });

  test('a hidden control is not judged, and a hidden border style is no border', () => {
    expect(
      forcedBoundaries([{ ...asItWas[0], display: 'none' }]).checks.boundedInForcedColours
    ).toBe(true);
    expect(
      forcedBoundaries([control('top', '↓ Download PDF', 'hidden', '1px')]).checks
        .boundedInForcedColours
    ).toBe(false);
  });
});

// Every layout marked the current layout's link by its fill and its text colour, which forced colours replace for every
// link alike, so there the current layout could not be told from the others by sight (#127).
describe("the current layout's link in forced colours", () => {
  const link = (label, current, underline = false, borderWidth = '0px', borderStyle = 'none') => ({
    label,
    current,
    display: 'block',
    underline,
    borderStyle,
    borderWidth
  });

  test('marked by its fill alone, it looks like the others, and fails', () => {
    const { checks, findings } = currentLayoutMarked([
      link('Nerd Mode', false),
      link('Impact Spotlight', true),
      link('Technical Profile', false)
    ]);

    expect(checks.currentMarkedInForcedColours).toBe(false);
    expect(findings.currentUnmarkedInForcedColours).toEqual([
      `the current layout's link, "Impact Spotlight", looks like the others in forced colours`
    ]);
  });

  test('an underline the others lack marks it, and so does a wider border', () => {
    expect(
      currentLayoutMarked([link('Nerd Mode', false), link('Impact Spotlight', true, true)]).checks
        .currentMarkedInForcedColours
    ).toBe(true);
    expect(
      currentLayoutMarked([
        link('Nerd Mode', true, false, '3px', 'solid'),
        link('Impact Spotlight', false, false, '1px', 'solid')
      ]).checks.currentMarkedInForcedColours
    ).toBe(true);
  });

  test('an underline every link shares marks nothing, nor does an equal border', () => {
    expect(
      currentLayoutMarked([link('Nerd Mode', false, true), link('Impact Spotlight', true, true)])
        .checks.currentMarkedInForcedColours
    ).toBe(false);
    expect(
      currentLayoutMarked([
        link('Nerd Mode', true, false, '1px', 'solid'),
        link('Impact Spotlight', false, false, '1px', 'solid')
      ]).checks.currentMarkedInForcedColours
    ).toBe(false);
  });

  test('a page with no current link has nothing to mark', () => {
    expect(
      currentLayoutMarked([link('Nerd Mode', false)]).checks.currentMarkedInForcedColours
    ).toBe(true);
  });

  // A check that judged nothing must not read as a pass: a hidden current link is not a page without one.
  test('a current link that is not shown fails, rather than passing as nothing to mark', () => {
    const { checks, findings } = currentLayoutMarked([
      { ...link('Impact Spotlight', true), display: 'none' },
      link('Nerd Mode', false),
      link('Technical Profile', false)
    ]);

    expect(checks.currentMarkedInForcedColours).toBe(false);
    expect(findings.currentUnmarkedInForcedColours).toEqual([
      `the current layout's link, "Impact Spotlight", is not shown, so nothing marks it`
    ]);
  });

  test('every link carrying aria-current is judged, not only the first', () => {
    const { checks, findings } = currentLayoutMarked([
      link('Nerd Mode', true, true),
      link('Impact Spotlight', true),
      link('Technical Profile', false)
    ]);

    expect(checks.currentMarkedInForcedColours).toBe(false);
    expect(findings.currentUnmarkedInForcedColours).toEqual([
      `the current layout's link, "Impact Spotlight", looks like the others in forced colours`
    ]);
  });
});

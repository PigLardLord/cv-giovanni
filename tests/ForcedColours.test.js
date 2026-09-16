import { forcedBoundaries } from '../scripts/lib/forced-colours.mjs';

// In a contrast theme a browser drops fills, shadows and background images, and keeps border styles. Impact Spotlight
// and Technical Profile marked Download PDF as a button by its fill and its shadow alone, so there it showed as bare
// text while Browser print kept its outline (#119). Measured with forced colours emulated.
const control = (place, label, primary, borderStyle, borderWidth) => ({
  place,
  label,
  primary,
  display: 'flex',
  borderStyle,
  borderWidth
});
const asItWas = [
  control('top', '↓ Download PDF', true, 'none', '0px'),
  control('footer', '↓ Download PDF', true, 'none', '0px'),
  control('footer', 'Browser print', false, 'solid', '1px')
];

describe('the actions in forced colours', () => {
  test('a primary marked by its fill and shadow alone has no border there, and fails', () => {
    const { checks, findings, measures } = forcedBoundaries(asItWas);

    expect(checks.boundedInForcedColours).toBe(false);
    expect(findings.unboundedInForcedColours).toEqual([
      'the top copy draws no border in forced colours',
      `the footer's "↓ Download PDF" draws no border in forced colours`
    ]);
    expect(measures.forced).toBe('0 · 0 · 1px');
  });

  test('every action bordered, the primary no thinner than the secondary, passes', () => {
    const bounded = [
      control('top', '↓ Download PDF', true, 'solid', '2px'),
      control('footer', '↓ Download PDF', true, 'solid', '2px'),
      control('footer', 'Browser print', false, 'solid', '1px')
    ];

    expect(forcedBoundaries(bounded)).toEqual({
      checks: { boundedInForcedColours: true },
      findings: { unboundedInForcedColours: [] },
      measures: { forced: '2 · 2 · 1px' }
    });
  });

  test('a primary thinner than the secondary fails', () => {
    const thin = [
      control('footer', '↓ Download PDF', true, 'solid', '1px'),
      control('footer', 'Browser print', false, 'solid', '2px')
    ];

    expect(forcedBoundaries(thin).findings.unboundedInForcedColours).toEqual([
      `the footer's "↓ Download PDF" draws a 1px border in forced colours, thinner than the secondary's 2px`
    ]);
  });

  test('a hidden action is not judged, and a hidden border style is no border', () => {
    expect(
      forcedBoundaries([{ ...asItWas[0], display: 'none' }]).checks.boundedInForcedColours
    ).toBe(true);
    expect(
      forcedBoundaries([control('footer', 'Browser print', false, 'hidden', '1px')]).checks
        .boundedInForcedColours
    ).toBe(false);
  });
});

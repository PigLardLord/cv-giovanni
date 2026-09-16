import { BOUNDARY_MINIMUM, secondaryButton } from '../scripts/lib/footer-buttons.mjs';

// The footer's Browser print button is the lesser action beside Download PDF (#110). The product review of #107
// found it carried the primary button's coloured shadow and drew no border. Measured on the page as it was:
// Impact Spotlight at 390px, and Nerd Mode, whose grey outline is deliberately quiet.
const asItWas = {
  label: 'Browser print',
  display: 'flex',
  shadow: 'rgba(184, 67, 27, 0.7) 0px 10px 20px -10px',
  borderStyle: 'none',
  borderWidth: '0px',
  borderColour: 'rgb(237, 220, 205)',
  behind: 'rgb(251, 244, 234)'
};
const outlined = {
  ...asItWas,
  shadow: 'none',
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColour: 'rgb(184, 67, 27)'
};
const nerd = {
  label: 'Browser print',
  display: 'flex',
  shadow: 'none',
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColour: 'rgb(58, 63, 71)',
  behind: 'rgb(28, 31, 37)'
};

describe('the footer’s secondary button', () => {
  test('as the page had it, it carries the primary button’s shadow and draws no border', () => {
    const { checks, findings } = secondaryButton(asItWas, { outlined: true });

    expect(checks.secondaryButton).toBe(false);
    expect(findings.secondaryLooksPrimary).toEqual([
      'the footer\'s "Browser print" carries a shadow: rgba(184, 67, 27, 0.7) 0px 10px 20px -10px',
      'the footer\'s "Browser print" draws no border'
    ]);
  });

  test('outlined in its label’s colour and with no shadow, it passes, and the report says by how much', () => {
    expect(BOUNDARY_MINIMUM).toBe(3);
    expect(secondaryButton(outlined, { outlined: true })).toEqual({
      checks: { secondaryButton: true },
      findings: { secondaryLooksPrimary: [] },
      measures: { secondary: 'border 4.99:1' }
    });
  });

  test('a border too faint to mark the button fails where the layout outlines it', () => {
    const faint = { ...outlined, borderColour: 'rgb(237, 220, 205)' };

    expect(secondaryButton(faint, { outlined: true }).findings.secondaryLooksPrimary).toEqual([
      'the footer\'s "Browser print" border rgb(237, 220, 205) on rgb(251, 244, 234) is 1.22:1'
    ]);
    const translucent = { ...outlined, borderColour: 'rgba(184, 67, 27, 0.2)' };
    expect(secondaryButton(translucent, { outlined: true }).checks.secondaryButton).toBe(false);
  });

  test('a layout that does not outline it needs no border contrast, and still no shadow', () => {
    expect(secondaryButton(nerd).checks.secondaryButton).toBe(true);
    expect(secondaryButton(nerd).measures.secondary).toBe('border 1.56:1');
    const shadowed = { ...nerd, shadow: 'rgba(0, 0, 0, 0.3) 0px 2px 4px 0px' };
    expect(secondaryButton(shadowed).checks.secondaryButton).toBe(false);
    expect(secondaryButton(shadowed).measures.secondary).toBe('border 1.56:1 · shadow');
  });

  test('a hidden or missing secondary button has nothing to judge', () => {
    for (const measured of [null, { ...asItWas, display: 'none' }]) {
      expect(secondaryButton(measured, { outlined: true })).toEqual({
        checks: { secondaryButton: true },
        findings: { secondaryLooksPrimary: [] },
        measures: { secondary: '—' }
      });
    }
  });
});

// #119: a hover shadow could reach the secondary button unseen, since the check read it at rest only.
describe('the secondary button with :hover forced', () => {
  const rest = {
    label: 'Browser print',
    display: 'inline-flex',
    shadow: 'none',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColour: 'rgb(184, 67, 27)',
    behind: 'rgb(251, 244, 234)'
  };

  test('carries no shadow on hover either', () => {
    expect(secondaryButton(rest, { outlined: true, hovered: rest }).checks.secondaryButton).toBe(
      true
    );
    const shadowed = { ...rest, shadow: 'rgba(184, 67, 27, 0.7) 0px 10px 20px -10px' };
    const judged = secondaryButton(rest, { outlined: true, hovered: shadowed });

    expect(judged.checks.secondaryButton).toBe(false);
    expect(judged.findings.secondaryLooksPrimary).toEqual([
      `the footer's "Browser print" carries a shadow on hover: ${shadowed.shadow}`
    ]);
    expect(judged.measures.secondary).toMatch(/ · shadow on hover$/);
  });
});

import { composite, contrast } from './download-reach.mjs';

/** WCAG 1.4.11 asks 3:1 of the boundary that marks a control against the colours next to it. */
export const BOUNDARY_MINIMUM = 3;

/**
 * Whether the footer's secondary button reads as the lesser action, judged from what the browser measured (#110).
 *
 * Browser print sits beside Download PDF. The product review of #107 found it carrying the primary button's
 * coloured shadow and drawing no border. `.print-button-secondary` was declared before the rule it modifies, so
 * it modified nothing, and the skins restored its colours but not its outline. So: a secondary control carries no
 * shadow, in any layout. Where a layout outlines it — a white button on a light footer, whose edge is the only
 * thing that marks it — that edge clears 3:1 against the footer, judged as it is painted. A layout that keeps it
 * quiet on purpose, as Nerd Mode's grey outline does, is not held to the contrast: its label names it.
 * @param {{ label: string, display: string, shadow: string, borderStyle: string, borderWidth: string, borderColour: string, behind: string }|null} measured -
 *   The secondary button's computed style, and the footer painted behind it; null where there is none
 * @param {{ outlined?: boolean }} [layout] - Whether the layout marks the button by its outline
 * @returns {{ checks: { secondaryButton: boolean }, findings: { secondaryLooksPrimary: string[] }, measures: { secondary: string } }}
 *   The check, what broke it, and what was measured
 */
export function secondaryButton(measured, { outlined = false } = {}) {
  if (!measured || measured.display === 'none') {
    return {
      checks: { secondaryButton: true },
      findings: { secondaryLooksPrimary: [] },
      measures: { secondary: '—' }
    };
  }
  const name = `the footer's "${measured.label}"`;
  const shadowed = Boolean(measured.shadow) && measured.shadow !== 'none';
  const drawn =
    !['none', 'hidden'].includes(measured.borderStyle) && parseFloat(measured.borderWidth) > 0;
  const ratio = drawn
    ? contrast(composite(measured.borderColour, measured.behind), measured.behind)
    : null;
  const findings = [
    ...(shadowed ? [`${name} carries a shadow: ${measured.shadow}`] : []),
    ...(outlined && !drawn ? [`${name} draws no border`] : []),
    ...(outlined && drawn && ratio < BOUNDARY_MINIMUM
      ? [`${name} border ${measured.borderColour} on ${measured.behind} is ${ratio.toFixed(2)}:1`]
      : [])
  ];
  return {
    checks: { secondaryButton: findings.length === 0 },
    findings: { secondaryLooksPrimary: findings },
    measures: {
      secondary: [
        drawn ? `border ${ratio.toFixed(2)}:1` : 'no border',
        ...(shadowed ? ['shadow'] : [])
      ].join(' · ')
    }
  };
}

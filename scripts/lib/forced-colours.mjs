/**
 * Whether the page's actions keep a boundary when forced colours take their fills and shadows away (#119).
 *
 * A contrast theme drops box-shadow and background images and replaces colours, but keeps border styles (CSS Color
 * Adjustment Module Level 1, §3.1). Impact Spotlight and Technical Profile marked Download PDF as a button by its fill
 * and its shadow alone, so in forced colours it showed as an arrow and a label, while Browser print kept its outline:
 * the lesser action was the only one drawn as a button. So every action draws a border there, and the primary's is no
 * thinner than the secondary's.
 * @param {{ place: string, label: string, primary: boolean, display: string, borderStyle: string, borderWidth: string }[]} controls -
 *   Every copy of the Download link and the footer's buttons, in page order, measured with forced colours emulated
 * @returns {{ checks: { boundedInForcedColours: boolean }, findings: { unboundedInForcedColours: string[] }, measures: { forced: string } }}
 *   The check, what broke it, and each action's border width
 */
export function forcedBoundaries(controls = []) {
  const shown = controls.filter((control) => control.display !== 'none');
  const width = (control) =>
    ['none', 'hidden'].includes(control.borderStyle) ? 0 : parseFloat(control.borderWidth) || 0;
  const name = (control) =>
    control.place === 'top' ? 'the top copy' : `the ${control.place}'s "${control.label}"`;
  const widest = Math.max(0, ...shown.filter((control) => !control.primary).map(width));
  const findings = [
    ...shown
      .filter((control) => width(control) === 0)
      .map((control) => `${name(control)} draws no border in forced colours`),
    ...shown
      .filter((control) => control.primary && width(control) > 0 && width(control) < widest)
      .map(
        (control) =>
          `${name(control)} draws a ${width(control)}px border in forced colours, thinner than the secondary's ${widest}px`
      )
  ];
  return {
    checks: { boundedInForcedColours: findings.length === 0 },
    findings: { unboundedInForcedColours: findings },
    measures: { forced: shown.length ? `${shown.map(width).join(' · ')}px` : '—' }
  };
}

/**
 * Whether the layout switcher tells the current layout from the others when forced colours replace their fills (#127).
 *
 * Every layout marked its current link by a fill and a text colour, which forced colours replace for every link alike,
 * so there the current layout could not be told from the others by sight. A marker the palette keeps is not a colour:
 * an underline the other links lack, or a border wider than theirs.
 *
 * Every link carrying aria-current is judged, not only the first. A current link that is not shown fails: only a page
 * with no current link at all has nothing to mark, and a check that judged nothing must not read as a pass.
 * @param {{ label: string, current: boolean, display: string, underline: boolean, borderStyle: string, borderWidth: string }[]} links -
 *   The switcher's links, measured with forced colours emulated
 * @returns {{ checks: { currentMarkedInForcedColours: boolean }, findings: { currentUnmarkedInForcedColours: string[] } }}
 *   The check, and what broke it
 */
export function currentLayoutMarked(links = []) {
  const shown = (link) => link.display !== 'none';
  const others = links.filter((link) => shown(link) && !link.current);
  const border = (link) =>
    ['none', 'hidden'].includes(link.borderStyle) ? 0 : parseFloat(link.borderWidth) || 0;
  const marked = (current) =>
    (current.underline && others.every((link) => !link.underline)) ||
    others.every((link) => border(current) > border(link));
  const findings = links
    .filter((link) => link.current)
    .filter((current) => !shown(current) || !marked(current))
    .map((current) =>
      shown(current)
        ? `the current layout's link, "${current.label}", looks like the others in forced colours`
        : `the current layout's link, "${current.label}", is not shown, so nothing marks it`
    );
  return {
    checks: { currentMarkedInForcedColours: findings.length === 0 },
    findings: { currentUnmarkedInForcedColours: findings }
  };
}

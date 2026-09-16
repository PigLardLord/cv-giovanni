/**
 * Whether the page's download control keeps a boundary when forced colours take its fill and shadow away (#119).
 *
 * A contrast theme drops box-shadow and background images and replaces colours, but keeps border styles (CSS Color
 * Adjustment Module Level 1, §3.1). Impact Spotlight and Technical Profile marked Download PDF as a button by its fill
 * and its shadow alone, so in forced colours it showed as an arrow and a label, while Browser print beside it kept
 * its outline. So every shown control draws a border there. Until #150 the primary's was also held to no thinner
 * than that secondary's; the page now offers one control, Browser print went with the footer, and there is no
 * lesser action left for it to out-draw.
 * @param {{ place: string, label: string, display: string, borderStyle: string, borderWidth: string }[]} controls -
 *   Every copy of the Download link, in page order, measured with forced colours emulated
 * @returns {{ checks: { boundedInForcedColours: boolean }, findings: { unboundedInForcedColours: string[] }, measures: { forced: string } }}
 *   The check, what broke it, and each shown control's border width
 */
export function forcedBoundaries(controls = []) {
  const shown = controls.filter((control) => control.display !== 'none');
  const width = (control) =>
    ['none', 'hidden'].includes(control.borderStyle) ? 0 : parseFloat(control.borderWidth) || 0;
  const name = (control) =>
    control.place === 'top' ? 'the top copy' : `the ${control.place}'s "${control.label}"`;
  const findings = shown
    .filter((control) => width(control) === 0)
    .map((control) => `${name(control)} draws no border in forced colours`);
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

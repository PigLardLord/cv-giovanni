/**
 * Whether the Download PDF link does its job on one render, judged from what the browser measured (#101).
 *
 * #59 put a copy of the link at the top of every layout and hid every copy when no PDF exists for the profile.
 * Its product reviews measured four things by hand. First, that a link with no file behind it hides, which had
 * never worked: `.print-button` set `display` over `[hidden]`. Second, that the top copy is on the first screen,
 * and stays on top where a layout pins it. Third, that a phone can tap it. Fourth, that a keyboard user can see it
 * has focus. These are those measurements, as checks. A fifth came from #107: a copy that broke its label in two
 * grew to 78px, tall enough to tap, so no height check saw it.
 *
 * A sixth since #150: the page offers the PDF from one control, the link at the top, and a second copy that shows
 * fails wherever it is. The footer that carried a second copy beside Browser print went, and with it the checks
 * that held that button to the link's tap height (#109) and to one height with the footer's copy (#116). A page
 * that shows no copy at all is left to `reachable`, which already fails it as "no top copy shows": reported twice,
 * one missing link would read as two defects.
 */

/** WCAG 1.4.11 asks 3:1 of a focus indicator against the colours next to it. */
export const RING_MINIMUM = 3;

/** The height the page renders its top copy at on a phone; any copy clears it, less a pixel of rounding. */
export const TAP_TARGET = 44;

/** A box is measured in fractions of a pixel, and less than a pixel past a limit is within it: a pixel of rounding. */
const ROUNDING = 1;

const channels = (css) => {
  const match = /rgba?\(([^)]+)\)/.exec(css || '');
  if (!match) throw new Error(`not an rgb() colour: ${css}`);
  return match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
};

const luminance = (css) => {
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = channels(css);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
};

/**
 * A colour as it is painted over another: a translucent ring shows the background through it, and a fully
 * transparent one shows nothing but the background.
 * @param {string} over - The colour painted on top, `rgb()` or `rgba()`
 * @param {string} under - The opaque colour beneath it
 * @returns {string} What reaches the screen, as `rgb()`
 */
export function composite(over, under) {
  const [red, green, blue, alpha = 1] = channels(over);
  const beneath = channels(under);
  const mix = (top, bottom) => Math.round(top * alpha + bottom * (1 - alpha));
  return `rgb(${mix(red, beneath[0])}, ${mix(green, beneath[1])}, ${mix(blue, beneath[2])})`;
}

/**
 * The WCAG contrast ratio between two colours, as a browser computes them: `rgb(138, 47, 15)`.
 * @param {string} first - One colour
 * @param {string} second - The other
 * @returns {number} The ratio, from 1 to 21
 */
export function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @param {object} measured - What the browser measured
 * @param {{ place: string, display: string, top: number, bottom: number, left: number, right: number, height: number, lines: number }[]} measured.links -
 *   Every copy of the link on the page as it loads, with a PDF to offer, in page order, with the lines its label
 *   renders on, in unrounded pixels: a value is rounded only where it is reported, so 45.4px is not 45px when it
 *   is judged
 * @param {{ place: string, display: string }[]} measured.withoutPdf - Every copy, loaded with no PDF to offer
 * @param {{ inViewport: boolean, topmost: boolean }|null} measured.afterScroll - The top copy after scrolling to
 *   the end, for a layout that pins it; null where it scrolls away by design
 * @param {{ focused: boolean, style: string, width: number, ring: string, behind: string }} measured.focus -
 *   The top copy reached with Tab: its outline, and the colour behind it
 * @param {{ width: number, height: number, mobile?: boolean }} size - The screen the page was rendered on
 * @returns {{ checks: Record<string, boolean>, findings: Record<string, string[]>, measures: Record<string, string> }}
 *   Each check, what broke it, and what was measured
 */
export function downloadReach(
  { links = [], withoutPdf = [], afterScroll = null, focus = null } = {},
  size = {}
) {
  const top = links.find((link) => link.place === 'top');
  const shown = links.filter((link) => link.display !== 'none');
  const drawn = Boolean(focus?.focused) && focus.style !== 'none' && focus.width > 0;
  // Judged as painted: a translucent ring shows what is behind it, and a transparent one is only that.
  const ratio = drawn ? contrast(composite(focus.ring, focus.behind), focus.behind) : 0;
  const px = (value) => Math.round(value);
  // A finding says what was judged, to the hundredth: 42.6px fails a 43px floor, and "43px" would say it clears it.
  const exact = (value) => Number(value.toFixed(2));

  const findings = {
    shownWithoutPdf: withoutPdf
      .filter((link) => link.display !== 'none')
      .map((link) => `the ${link.place} copy computes display: ${link.display} with no PDF`),
    unreachable: [
      ...(!top || top.display === 'none'
        ? ['no top copy shows']
        : [
            ...(top.top <= -ROUNDING || top.bottom >= size.height + ROUNDING
              ? [
                  `the top copy spans ${exact(top.top)}–${exact(top.bottom)}px of a ${size.height}px screen`
                ]
              : []),
            ...(top.left <= -ROUNDING || top.right >= size.width + ROUNDING
              ? [
                  `the top copy spans ${exact(top.left)}–${exact(top.right)}px across a ${size.width}px screen`
                ]
              : [])
          ]),
      ...(afterScroll && !(afterScroll.inViewport && afterScroll.topmost)
        ? ['the pinned top copy is not on top after scrolling to the end']
        : [])
    ],
    untappable: size.mobile
      ? [
          ...shown
            .filter((link) => link.height < TAP_TARGET - ROUNDING)
            .map((link) => `the ${link.place} copy renders ${exact(link.height)}px`),
          ...(top && top.display !== 'none' && Math.abs(top.height - TAP_TARGET) > ROUNDING
            ? [`the top copy renders ${exact(top.height)}px, not ${TAP_TARGET}`]
            : [])
        ]
      : [],
    brokenLabel: shown
      .filter((link) => link.lines !== 1)
      .map((link) =>
        link.lines
          ? `the ${link.place} copy breaks its label onto ${link.lines} lines`
          : `the ${link.place} copy renders no label`
      ),
    // One control (#150). None at all is `unreachable`'s finding, and is not repeated here.
    extraControls:
      shown.length > 1
        ? [
            `the page shows ${shown.length} download controls: ${shown.map((link) => link.place).join(', ')}`
          ]
        : [],
    faintFocus: !focus?.focused
      ? ['Tab never reached the top copy']
      : !drawn
        ? [`no ring is drawn: outline-style ${focus.style}, ${focus.width}px wide`]
        : ratio < RING_MINIMUM
          ? [`its ring ${focus.ring} on ${focus.behind} is ${ratio.toFixed(2)}:1`]
          : []
  };

  return {
    checks: {
      hiddenWithoutPdf: findings.shownWithoutPdf.length === 0,
      reachable: findings.unreachable.length === 0,
      tappable: findings.untappable.length === 0,
      visibleFocus: findings.faintFocus.length === 0,
      labelOnOneLine: findings.brokenLabel.length === 0,
      oneControl: findings.extraControls.length === 0
    },
    findings,
    measures: {
      controls: String(shown.length),
      top: top && top.display !== 'none' ? `${px(top.top)}–${px(top.bottom)}px` : '—',
      heights: shown.length ? `${shown.map((link) => px(link.height)).join(' · ')}px` : '—',
      lines: shown.map((link) => link.lines).join(' · ') || '—',
      ring: drawn ? `${ratio.toFixed(2)}:1` : '—'
    }
  };
}

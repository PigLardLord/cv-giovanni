import { contrast } from './download-reach.mjs';
import { pixelAt } from './png.mjs';

/** WCAG 1.4.11 asks 3:1 of a focus indicator against the colours next to it. */
export const RING_MINIMUM = 3;

/** How near a pixel's colour must be to the outline's to be ring, as a distance in RGB. */
const RING_TOLERANCE = 60;

/** The share of places where a ring may fall under the minimum before it fails: a letter beside it, not a side. */
const SPARE = 0.1;

const rgb = (css) => (css.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const near = (pixel, colour) =>
  Math.hypot(...rgb(pixel).map((channel, index) => channel - colour[index])) <= RING_TOLERANCE;

/**
 * A focus ring judged by the pixels painted around it (#111).
 *
 * An outline's computed colour says nothing about what it is drawn across. The footer's Download button carried a
 * coloured shadow, and a ring that cleared 3:1 on the plain footer measured 1.86:1 where it crossed it; a check of
 * one background colour under one point had scored that 11/11. So here the ring is read from a screenshot.
 *
 * - **Where it is.** On each line across a straight edge of the control, the ring is the run of pixels near the
 *   outline's colour, starting where the outline's offset puts it, a pixel either way. A box measured in
 *   fractions of a pixel lands a pixel off where the ring is painted, and a button filled in its ring's colour
 *   is not its ring.
 * - **What it is against.** The pixel just past the run, outside, and the one just before it, inside: the gap
 *   between ring and control, or the control itself where the ring touches it. The smoother pixel beside each end
 *   of the run is skipped, being neither, unless it is the only pixel between ring and control.
 * - **Which lines.** A link wrapped onto several lines has its outline drawn around the lines together, so the
 *   first line's top, the last line's bottom and every line's two ends are read, and no line where two lines meet.
 *   Corners are left out, where the ring bends.
 * - **The verdict.** The worst tenth of the places read is let go, because a letter beside the ring is not a faint
 *   ring, and the contrast is the worst of the rest. A ring found at fewer than half the places is not painted.
 *   Each side is also held to itself, because a tenth of every place is more than the whole end of a wide button:
 *   a side faint at more than half its places fails the ring, and a side the ring is missing from along more than
 *   half is not painted there.
 * @param {{ width: number, height: number, pixels: Uint8Array }} image - A screenshot around the control
 * @param {{ rects: { left: number, top: number, right: number, bottom: number }[], colour: string, width: number, offset: number, radius?: number }} outline -
 *   The control's line boxes in the image, in whole pixels with right and bottom exclusive, and its outline's
 *   computed colour, width, offset and corner radius
 * @returns {{ ratio: number, painted?: false, ring?: string, against?: string, side?: string, where?: string, found: number, samples: number }|null}
 *   The contrast and where it was measured, the share of places the ring was found at and how many places were
 *   read; null when none of the ring's reach is in the image
 */
export function ringOnPixels(image, { rects, colour, width, offset, radius = 0 }) {
  const target = rgb(colour);
  const reach = offset + width + 4;
  const corner = Math.ceil(radius) + offset + width + 2;
  const inImage = ([x, y]) => x >= 0 && y >= 0 && x < image.width && y < image.height;

  const edges = rects.flatMap((rect, index) => [
    ...(index === 0 ? [['top', rect]] : []),
    ['right', rect],
    ...(index === rects.length - 1 ? [['bottom', rect]] : []),
    ['left', rect]
  ]);
  const places = [];
  let found = 0;
  for (const [side, rect] of edges) {
    const point = {
      top: (along, distance) => [along, rect.top - distance],
      bottom: (along, distance) => [along, rect.bottom - 1 + distance],
      left: (along, distance) => [rect.left - distance, along],
      right: (along, distance) => [rect.right - 1 + distance, along]
    }[side];
    const [from, to] =
      side === 'top' || side === 'bottom' ? [rect.left, rect.right] : [rect.top, rect.bottom];
    const positions =
      to - from > 2 * corner
        ? Array.from({ length: to - from - 2 * corner }, (unused, index) => from + corner + index)
        : [Math.floor((from + to - 1) / 2)];
    for (const along of positions) {
      const line = [];
      for (let distance = -1; distance <= reach + 2; distance++) line.push(point(along, distance));
      if (!line.every(inImage)) continue;
      const colours = line.map(([x, y]) => pixelAt(image, x, y));
      // Index 0 is a pixel inside the control, so a distance is its index less one. The ring starts where its
      // offset puts it, a pixel either way, and never inside the control: a button filled in its ring's colour
      // would otherwise be taken for the ring.
      const start = colours.findIndex(
        (pixel, index) =>
          index - 1 >= Math.max(0, offset - 1) &&
          index - 1 <= offset + width + 1 &&
          near(pixel, target)
      );
      if (start < 0) {
        places.push({ side });
        continue;
      }
      let end = start;
      while (end + 1 < colours.length && near(colours[end + 1], target)) end += 1;
      const ringPixel = colours[Math.floor((start + end) / 2)];
      const beyond = colours[Math.min(colours.length - 1, end + 2)];
      // Past the smoother pixel beside the run, unless one pixel is all that stands between ring and control: then
      // that pixel, the gap, and not the control a box measured a pixel off would put in its place.
      const between = colours[start >= 4 ? start - 2 : start === 3 ? 2 : 0];
      found += 1;
      const [outside, inside] = [contrast(ringPixel, beyond), contrast(ringPixel, between)];
      places.push(
        outside <= inside
          ? { ratio: outside, ring: ringPixel, against: beyond, side, where: 'outside' }
          : { ratio: inside, ring: ringPixel, against: between, side, where: 'inside' }
      );
    }
  }
  if (!places.length) return null;
  const share = found / places.length;
  if (share < 0.5) return { ratio: 1, painted: false, found: share, samples: places.length };
  // A tenth of every place together is let go, but never most of a side: the whole end of a wide button is fewer
  // places than a tenth of all, and a ring faint or missing along it would go unjudged (the code review of #111).
  const sides = new Map();
  for (const place of places) sides.set(place.side, [...(sides.get(place.side) || []), place]);
  for (const [side, read] of sides) {
    const onSide = read
      .filter((place) => place.ratio !== undefined)
      .sort((a, b) => a.ratio - b.ratio);
    if (onSide.length < read.length / 2) {
      return { ratio: 1, painted: false, side, found: share, samples: places.length };
    }
    const middle = onSide[Math.floor(onSide.length / 2)];
    if (middle.ratio < RING_MINIMUM) return { ...middle, found: share, samples: places.length };
  }
  const judged = places
    .filter((place) => place.ratio !== undefined)
    .sort((a, b) => a.ratio - b.ratio);
  const verdict = judged[Math.min(judged.length - 1, Math.floor(judged.length * SPARE))];
  return { ...verdict, found: share, samples: places.length };
}

/**
 * The rings of every control Tab reached on one render: the check, what broke it, and the worst ring measured.
 * @param {{ name: string, result: object|null }[]} rings - Each control, and `ringOnPixels` for its ring
 * @returns {{ checks: { ringsClear: boolean }, findings: { faintRings: string[] }, measures: { rings: string } }}
 *   The check, what broke it, and what was measured
 */
export function ringsReport(rings) {
  const faintRings = !rings.length
    ? ['Tab reached no control']
    : rings.flatMap(({ name, result }) =>
        !result
          ? [`"${name}": its ring could not be read from the screen`]
          : result.painted === false
            ? [
                `"${name}": its ring is not painted along most of its ${result.side ? `${result.side} ` : ''}edge`
              ]
            : result.ratio < RING_MINIMUM
              ? [
                  `"${name}": its ring is ${result.ratio.toFixed(2)}:1 against ${result.against} ${result.where} it, at the ${result.side}`
                ]
              : []
      );
  const judged = rings.filter(({ result }) => result);
  const worst = judged.reduce(
    (least, entry) => (!least || entry.result.ratio < least.result.ratio ? entry : least),
    null
  );
  return {
    checks: { ringsClear: faintRings.length === 0 },
    findings: { faintRings },
    measures: {
      rings: worst
        ? `${rings.length} controls, worst ${worst.result.ratio.toFixed(2)}:1 (${worst.name})`
        : '—'
    }
  };
}

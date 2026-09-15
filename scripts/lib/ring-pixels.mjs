import { contrast } from './download-reach.mjs';
import { pixelAt } from './png.mjs';

/** WCAG 1.4.11 asks 3:1 of a focus indicator against the colours next to it. */
export const RING_MINIMUM = 3;

/**
 * A focus ring judged by the pixels painted around it (#111).
 *
 * An outline's computed colour says nothing about what it is drawn across. The footer's Download button carried a
 * coloured shadow, and a ring that cleared 3:1 on the plain footer measured 1.86:1 where it crossed it. A check
 * reading one background colour under one point had scored that 11/11. So here the ring is read from a
 * screenshot, along its straight edges. Each ring pixel is compared with the pixel just outside the ring, and
 * with the one between the ring and the control — or the control itself, when the ring touches it. The worst
 * place is the ring's contrast. Corners are left out: the ring bends there, and its smoothed pixels are neither
 * ring nor background. The ring's colour is the colour painted, so a translucent or missing ring is judged as
 * the reader sees it.
 * @param {{ width: number, height: number, pixels: Uint8Array }} image - A screenshot around the control
 * @param {{ box: { left: number, top: number, right: number, bottom: number }, width: number, offset: number, radius?: number }} geometry -
 *   The control's box in the image, in whole pixels with right and bottom exclusive, and its outline's width,
 *   offset and corner radius in pixels
 * @returns {{ ratio: number, ring: string, against: string, side: string, where: string, samples: number }|null}
 *   The worst place and how many places were read, or null when none of the ring is in the image
 */
export function ringOnPixels(image, { box, width, offset, radius = 0 }) {
  const middle = offset + Math.ceil(width / 2);
  const outside = offset + width + 2;
  const inside = offset >= 2 ? 1 : 0;
  const corner = Math.ceil(radius) + offset + width + 2;

  // A point `distance` pixels out from one side of the box, `along` that side; 0 is the box's own edge pixel.
  const point = {
    top: (along, distance) => [along, box.top - distance],
    bottom: (along, distance) => [along, box.bottom - 1 + distance],
    left: (along, distance) => [box.left - distance, along],
    right: (along, distance) => [box.right - 1 + distance, along]
  };
  const spans = {
    top: [box.left, box.right],
    bottom: [box.left, box.right],
    left: [box.top, box.bottom],
    right: [box.top, box.bottom]
  };
  const inImage = ([x, y]) => x >= 0 && y >= 0 && x < image.width && y < image.height;

  let worst = null;
  let samples = 0;
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const [from, to] = spans[side];
    const straight = to - from > 2 * corner;
    const positions = straight
      ? Array.from({ length: to - from - 2 * corner }, (unused, index) => from + corner + index)
      : [Math.floor((from + to - 1) / 2)];
    for (const along of positions) {
      const places = [
        point[side](along, middle),
        point[side](along, outside),
        point[side](along, inside)
      ];
      if (!places.every(inImage)) continue;
      const [ring, beyond, between] = places.map(([x, y]) => pixelAt(image, x, y));
      samples += 1;
      for (const [where, against] of [
        ['outside', beyond],
        ['inside', between]
      ]) {
        const ratio = contrast(ring, against);
        if (!worst || ratio < worst.ratio) worst = { ratio, ring, against, side, where };
      }
    }
  }
  return worst ? { ...worst, samples } : null;
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

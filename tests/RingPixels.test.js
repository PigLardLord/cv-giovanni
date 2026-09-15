import { RING_MINIMUM, ringOnPixels, ringsReport } from '../scripts/lib/ring-pixels.mjs';

// The screen audit judged the Download link's focus ring by one computed colour. A ring drawn across a button's
// coloured shadow scored 11/11 at 1.86:1 (#111). These rings are painted here, pixel by pixel, the way a
// screenshot holds them: a control, its ring two pixels out, and what the page paints around them. The ring is
// found on each line across its edge, not assumed at a distance, because a box measured in fractions lands a
// pixel either way of where the ring is painted.
const WHITE = [255, 255, 255];
const CONTROL = [30, 64, 175];
const DEEP = [138, 47, 15];
const BRIGHT = [232, 100, 31];
const SHADOW = [227, 184, 164];
const TEXT = [248, 187, 160];

const canvas = (width, height, colour = WHITE) => {
  const pixels = new Uint8Array(width * height * 4);
  for (let at = 0; at < pixels.length; at += 4) pixels.set([...colour, 255], at);
  return { width, height, pixels };
};
const paint = (image, [left, top, right, bottom], colour) => {
  for (let y = Math.max(0, top); y < Math.min(image.height, bottom); y++) {
    for (let x = Math.max(0, left); x < Math.min(image.width, right); x++) {
      image.pixels.set([...colour, 255], (y * image.width + x) * 4);
    }
  }
  return image;
};
/** An outline `width` pixels wide, `offset` pixels out from the rect, as a browser paints `outline`. */
const outline = (image, rect, { width, offset }, colour) => {
  const [left, top, right, bottom] = [
    rect.left - offset - width,
    rect.top - offset - width,
    rect.right + offset + width,
    rect.bottom + offset + width
  ];
  paint(image, [left, top, right, top + width], colour);
  paint(image, [left, bottom - width, right, bottom], colour);
  paint(image, [left, top, left + width, bottom], colour);
  paint(image, [right - width, top, right, bottom], colour);
  return image;
};
const rect = { left: 15, top: 12, right: 45, bottom: 28 };
const ring = (colour, change = {}) => ({
  rects: [rect],
  colour: `rgb(${colour.join(', ')})`,
  width: 2,
  offset: 2,
  radius: 0,
  ...change
});
const control = () =>
  paint(canvas(60, 40), [rect.left, rect.top, rect.right, rect.bottom], CONTROL);

describe('a focus ring, read from the pixels around it', () => {
  test('a deep ring on the plain page clears 3:1, found all the way round', () => {
    const result = ringOnPixels(outline(control(), rect, ring(DEEP), DEEP), ring(DEEP));

    expect(RING_MINIMUM).toBe(3);
    expect(result.ratio).toBeGreaterThan(RING_MINIMUM);
    expect(result.found).toBe(1);
    expect(result.samples).toBeGreaterThan(40);
  });

  test('found where the box measured a pixel off from where the ring is painted', () => {
    const painted = outline(
      control(),
      { ...rect, left: rect.left + 1, right: rect.right + 1, top: rect.top - 1 },
      ring(DEEP),
      DEEP
    );

    expect(ringOnPixels(painted, ring(DEEP))).toMatchObject({ found: 1 });
    expect(ringOnPixels(painted, ring(DEEP)).ratio).toBeGreaterThan(RING_MINIMUM);
  });

  test('a bright ring across a coloured shadow fails where it crosses it, and says where', () => {
    const shadowed = paint(control(), [0, rect.bottom, 60, rect.bottom + 9], SHADOW);
    const result = ringOnPixels(outline(shadowed, rect, ring(BRIGHT), BRIGHT), ring(BRIGHT));

    expect(result).toMatchObject({
      side: 'bottom',
      ring: 'rgb(232, 100, 31)',
      against: 'rgb(227, 184, 164)'
    });
    expect(result.ratio).toBeCloseTo(1.86, 1);
  });

  test('the deep ring across the same shadow clears it', () => {
    const shadowed = paint(control(), [0, rect.bottom, 60, rect.bottom + 9], SHADOW);

    expect(ringOnPixels(outline(shadowed, rect, ring(DEEP), DEEP), ring(DEEP)).ratio).toBeCloseTo(
      4.67,
      1
    );
  });

  test('a button filled in its own ring’s colour is not taken for its ring: the ring is looked for where its offset puts it', () => {
    const filled = paint(canvas(60, 40), [rect.left, rect.top, rect.right, rect.bottom], DEEP);
    const result = ringOnPixels(outline(filled, rect, ring(DEEP), DEEP), ring(DEEP));

    expect(result).toMatchObject({ found: 1 });
    expect(result.ratio).toBeGreaterThan(RING_MINIMUM);
  });

  test('a ring that is not painted is not found, and is no ring, whatever the stylesheet says', () => {
    expect(ringOnPixels(control(), ring(DEEP))).toMatchObject({ painted: false, ratio: 1 });
  });

  test('with no gap, the ring is judged against the control it touches', () => {
    const touching = ring(DEEP, { offset: 0 });
    const result = ringOnPixels(outline(control(), rect, touching, DEEP), touching);

    expect(result).toMatchObject({ where: 'inside', against: 'rgb(30, 64, 175)' });
    expect(result.ratio).toBeLessThan(RING_MINIMUM);
  });

  test('a few letters beside the ring do not fail it; a ring crossing text along a whole side does', () => {
    const lettered = outline(control(), rect, ring(DEEP), DEEP);
    paint(lettered, [20, rect.top - 7, 22, rect.top - 5], TEXT);
    expect(ringOnPixels(lettered, ring(DEEP)).ratio).toBeGreaterThan(RING_MINIMUM);

    const crossed = outline(
      paint(control(), [0, rect.top - 9, 60, rect.top - 4], TEXT),
      rect,
      ring(BRIGHT),
      BRIGHT
    );
    expect(ringOnPixels(crossed, ring(BRIGHT)).ratio).toBeLessThan(RING_MINIMUM);
  });

  test('a link wrapped onto two lines is read around the outline its lines make, not across them', () => {
    const lines = [
      { left: 12, top: 8, right: 50, bottom: 16 },
      { left: 6, top: 16, right: 30, bottom: 24 }
    ];
    const image = canvas(60, 40);
    for (const line of lines) outline(image, line, { width: 2, offset: 2 }, DEEP);
    for (const line of lines)
      paint(image, [line.left - 2, line.top, line.right + 2, line.bottom], WHITE);
    paint(
      image,
      [lines[1].left - 2, lines[0].bottom - 2, lines[0].right + 2, lines[1].top + 2],
      WHITE
    );

    const result = ringOnPixels(image, {
      rects: lines,
      colour: 'rgb(138, 47, 15)',
      width: 2,
      offset: 2,
      radius: 0
    });
    expect(result.painted).not.toBe(false);
    expect(result.ratio).toBeGreaterThan(RING_MINIMUM);
  });

  test('nothing to read at all is no judgement', () => {
    const outOfView = {
      rects: [{ left: 1, top: 1, right: 3, bottom: 3 }],
      colour: 'rgb(138, 47, 15)',
      width: 2,
      offset: 2,
      radius: 0
    };

    expect(ringOnPixels(canvas(3, 3), outOfView)).toBeNull();
  });
});

describe('the rings on one render', () => {
  test('pass when every control’s ring clears 3:1, and report the worst', () => {
    const report = ringsReport([
      {
        name: 'GitHub',
        result: { ratio: 12.77, side: 'top', where: 'outside', against: 'rgb(28, 31, 37)' }
      },
      {
        name: 'Download PDF',
        result: { ratio: 4.67, side: 'bottom', where: 'inside', against: 'rgb(227, 184, 164)' }
      }
    ]);

    expect(report).toEqual({
      checks: { ringsClear: true },
      findings: { faintRings: [] },
      measures: { rings: '2 controls, worst 4.67:1 (Download PDF)' }
    });
  });

  test('fail on a faint ring, a ring not painted, a ring that could not be read, and a page Tab reaches nothing on', () => {
    const report = ringsReport([
      {
        name: 'Download PDF',
        result: { ratio: 1.86, side: 'bottom', where: 'outside', against: 'rgb(227, 184, 164)' }
      },
      { name: 'GitHub', result: { ratio: 1, painted: false } },
      { name: 'Browser print', result: null }
    ]);

    expect(report.checks.ringsClear).toBe(false);
    expect(report.findings.faintRings).toEqual([
      '"Download PDF": its ring is 1.86:1 against rgb(227, 184, 164) outside it, at the bottom',
      '"GitHub": its ring is not painted along most of its edge',
      '"Browser print": its ring could not be read from the screen'
    ]);
    expect(ringsReport([]).findings.faintRings).toEqual(['Tab reached no control']);
  });
});

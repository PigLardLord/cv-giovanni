import { RING_MINIMUM, ringOnPixels, ringsReport } from '../scripts/lib/ring-pixels.mjs';

// The screen audit judged the Download link's focus ring by one computed colour, and a ring drawn across a
// button's coloured shadow scored 11/11 at 1.86:1 (#111). These rings are painted here, pixel by pixel, the way a
// screenshot would hold them: a control, its ring two pixels out, and what the page paints around them.
const WHITE = [255, 255, 255];
const CONTROL = [30, 64, 175];
const DEEP = [138, 47, 15];
const BRIGHT = [232, 100, 31];
const SHADOW = [227, 184, 164];

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
/** An outline `width` pixels wide, `offset` pixels out from the box, as a browser paints `outline`. */
const outline = (image, box, { width, offset }, colour) => {
  const [left, top, right, bottom] = [
    box.left - offset - width,
    box.top - offset - width,
    box.right + offset + width,
    box.bottom + offset + width
  ];
  paint(image, [left, top, right, top + width], colour);
  paint(image, [left, bottom - width, right, bottom], colour);
  paint(image, [left, top, left + width, bottom], colour);
  paint(image, [right - width, top, right, bottom], colour);
  return image;
};
const box = { left: 15, top: 12, right: 45, bottom: 28 };
const geometry = { box, width: 2, offset: 2, radius: 0 };
const control = () => paint(canvas(60, 40), [box.left, box.top, box.right, box.bottom], CONTROL);

describe('a focus ring, read from the pixels around it', () => {
  test('a deep ring on the plain page clears 3:1 on every side', () => {
    const result = ringOnPixels(outline(control(), box, geometry, DEEP), geometry);

    expect(RING_MINIMUM).toBe(3);
    expect(result.ratio).toBeGreaterThan(RING_MINIMUM);
    expect(result.samples).toBeGreaterThan(40);
  });

  test('a bright ring across a coloured shadow fails where it crosses it, and says where', () => {
    const shadowed = paint(control(), [0, box.bottom, 60, box.bottom + 9], SHADOW);
    const result = ringOnPixels(outline(shadowed, box, geometry, BRIGHT), geometry);

    expect(result).toMatchObject({
      side: 'bottom',
      ring: 'rgb(232, 100, 31)',
      against: 'rgb(227, 184, 164)'
    });
    expect(result.ratio).toBeCloseTo(1.86, 1);
  });

  test('the deep ring across the same shadow clears it', () => {
    const shadowed = paint(control(), [0, box.bottom, 60, box.bottom + 9], SHADOW);

    expect(ringOnPixels(outline(shadowed, box, geometry, DEEP), geometry).ratio).toBeCloseTo(
      4.67,
      1
    );
  });

  test('a ring that is not painted is 1:1, whatever the stylesheet says', () => {
    expect(ringOnPixels(control(), geometry).ratio).toBeCloseTo(1, 2);
  });

  test('with no gap, the ring is judged against the control it touches', () => {
    const touching = { ...geometry, offset: 0 };
    const result = ringOnPixels(outline(control(), box, touching, DEEP), touching);

    expect(result).toMatchObject({ where: 'inside', against: 'rgb(30, 64, 175)' });
    expect(result.ratio).toBeLessThan(RING_MINIMUM);
  });

  test('a control too small for straight edges is read at the middle of each side, and one against the edge of the image skips what is not in it', () => {
    const tiny = {
      box: { left: 20, top: 15, right: 24, bottom: 19 },
      width: 2,
      offset: 2,
      radius: 8
    };
    expect(ringOnPixels(outline(canvas(60, 40), tiny.box, tiny, DEEP), tiny).samples).toBe(4);

    const edge = {
      box: { left: 2, top: 12, right: 30, bottom: 28 },
      width: 2,
      offset: 2,
      radius: 0
    };
    const result = ringOnPixels(outline(canvas(60, 40), edge.box, edge, DEEP), edge);
    expect(result.ratio).toBeGreaterThan(RING_MINIMUM);
  });

  test('nothing to read at all is no judgement', () => {
    const outOfView = {
      box: { left: 1, top: 1, right: 3, bottom: 3 },
      width: 2,
      offset: 2,
      radius: 0
    };

    expect(ringOnPixels(canvas(4, 4), outOfView)).toBeNull();
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

  test('fail on a faint ring, a ring that could not be read, and a page Tab reaches nothing on', () => {
    const report = ringsReport([
      {
        name: 'Download PDF',
        result: { ratio: 1.86, side: 'bottom', where: 'outside', against: 'rgb(227, 184, 164)' }
      },
      { name: 'Browser print', result: null }
    ]);

    expect(report.checks.ringsClear).toBe(false);
    expect(report.findings.faintRings).toEqual([
      '"Download PDF": its ring is 1.86:1 against rgb(227, 184, 164) outside it, at the bottom',
      '"Browser print": its ring could not be read from the screen'
    ]);
    expect(ringsReport([]).findings.faintRings).toEqual(['Tab reached no control']);
  });
});

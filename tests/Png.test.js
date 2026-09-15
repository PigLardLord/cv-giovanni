/**
 * @jest-environment node
 */
import { deflateSync } from 'node:zlib';
import { decodePng, pixelAt } from '../scripts/lib/png.mjs';

// The screen audit judges a focus ring by the pixels painted around it (#111), from the PNG the browser's
// screenshot returns. The decoder reads what Chrome writes — 8 bits a channel, RGB or RGBA, not interlaced — and
// refuses anything else rather than misread it. These PNGs are written here, one row filter at a time.
const paeth = (a, b, c) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A PNG of `rows` (arrays of [r, g, b, a]), every row filtered with `filter`. */
const png = (
  rows,
  { filter = 0, channels = 4, depth = 8, colour = channels === 4 ? 6 : 2, interlace = 0 } = {}
) => {
  const width = rows[0].length;
  const stride = width * channels;
  let previous = new Array(stride).fill(0);
  const lines = rows.map((row) => {
    const current = row.flatMap((pixel) => pixel.slice(0, channels));
    const filtered = current.map((value, x) => {
      const a = x >= channels ? current[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      return (value - predicted + 256) % 256;
    });
    previous = current;
    return Buffer.from([filter, ...filtered]);
  });
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), body, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = depth;
  header[9] = colour;
  header[12] = interlace;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(lines))),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

const picture = [
  [
    [255, 255, 255, 255],
    [138, 47, 15, 255],
    [251, 244, 234, 255]
  ],
  [
    [227, 184, 164, 255],
    [30, 64, 175, 128],
    [0, 0, 0, 0]
  ]
];

describe('a PNG the browser wrote', () => {
  test.each([
    ['none', 0],
    ['sub', 1],
    ['up', 2],
    ['average', 3],
    ['paeth', 4]
  ])('decodes rows filtered with %s, pixel for pixel', (name, filter) => {
    const image = decodePng(png(picture, { filter }));

    expect([image.width, image.height]).toEqual([3, 2]);
    expect([...image.pixels]).toEqual(picture.flat(2));
  });

  test('reads RGB as opaque, and names a pixel as rgb()', () => {
    const image = decodePng(png(picture, { channels: 3, filter: 4 }));

    expect(pixelAt(image, 1, 0)).toBe('rgb(138, 47, 15)');
    expect(pixelAt(image, 1, 1)).toBe('rgb(30, 64, 175)');
    expect(image.pixels[7]).toBe(255);
  });

  test.each([
    ['bytes that are not a PNG', Buffer.from('<svg/>'), /not a PNG/],
    ['16 bits a channel', png(picture, { depth: 16 }), /does not read/],
    ['an interlaced PNG', png(picture, { interlace: 1 }), /does not read/],
    ['a palette', png(picture, { colour: 3, channels: 3 }), /does not read/]
  ])('refuses %s rather than misread it', (what, bytes, reason) => {
    expect(() => decodePng(bytes)).toThrow(reason);
  });

  test('a pixel outside the image is a mistake in the caller, and throws', () => {
    const image = decodePng(png(picture));

    expect(() => pixelAt(image, 3, 0)).toThrow(/outside/);
    expect(() => pixelAt(image, 0, -1)).toThrow(/outside/);
  });
});

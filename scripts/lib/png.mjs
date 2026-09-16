import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Bytes a pixel, by PNG colour type: RGB and RGBA are what a browser's screenshot writes. */
const CHANNELS = { 2: 3, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Decodes a PNG the browser wrote into RGBA pixels (#111).
 *
 * The screen audit judges a focus ring by the pixels painted around it, and Chrome's `Page.captureScreenshot`
 * returns a PNG: 8 bits a channel, RGB or RGBA, not interlaced. That is what this reads, with no dependency, and
 * anything else — another depth, a palette, interlacing — is refused rather than misread, because a ring judged
 * on the wrong pixels passes or fails for nothing. The checksum is not verified: the bytes come straight from the
 * browser.
 * @param {Buffer} bytes - The PNG
 * @returns {{ width: number, height: number, pixels: Uint8Array }} The image, four bytes a pixel, row by row
 */
export function decodePng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG');
  }
  let header = null;
  const data = [];
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colour: body[9],
        interlace: body[12]
      };
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error('not a PNG: it has no header');
  const channels = CHANNELS[header.colour];
  if (header.depth !== 8 || !channels || header.interlace !== 0) {
    throw new Error(
      `a PNG this decoder does not read: ${header.depth} bits a channel, colour type ${header.colour}, interlace ${header.interlace}`
    );
  }

  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const current = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? current[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      if (predicted === undefined) throw new Error(`a PNG row with filter ${filter}`);
      current[x] = (raw[start + 1 + x] + predicted) & 255;
    }
    for (let x = 0; x < width; x++) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels.set(
        [
          current[from],
          current[from + 1],
          current[from + 2],
          channels === 4 ? current[from + 3] : 255
        ],
        to
      );
    }
    previous = current;
  }
  return { width, height, pixels };
}

/**
 * One pixel of a decoded image, as the colour a contrast is computed from.
 * @param {{ width: number, height: number, pixels: Uint8Array }} image - A decoded PNG
 * @param {number} x - Column, from 0
 * @param {number} y - Row, from 0
 * @returns {string} `rgb(r, g, b)`
 */
export function pixelAt({ width, height, pixels }, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error(`pixel ${x}, ${y} is outside a ${width}×${height} image`);
  }
  const at = (y * width + x) * 4;
  return `rgb(${pixels[at]}, ${pixels[at + 1]}, ${pixels[at + 2]})`;
}

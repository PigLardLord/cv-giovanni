/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { pages, roomLeft } from '../scripts/lib/room-left.mjs';

// `pdftotext -bbox-layout` of a document pdfmake built from 46 one-line paragraphs on LETTER, set the
// way the CV sets its body: Inter at 9.3pt, a line height of 1.4, 40pt top and bottom margins. Page one
// holds 45 lines — pdfmake had no room for the 46th and started page two with it — so page one is a
// page known to be full, and page two holds a single line (#49).
const extract = readFileSync(
  new URL('./fixtures/room-left/forty-six-lines.txt', import.meta.url),
  'utf8'
);
const settings = { bottomMargin: 40, lineHeight: 1.4 };

describe('the room left on a page', () => {
  test('reads every page of the extract, and the lines on each', () => {
    const [full, last] = pages(extract);

    expect(pages(extract)).toHaveLength(2);
    expect([full.lines.length, last.lines.length]).toEqual([45, 1]);
    expect(full.height).toBe(792);
  });

  test('on a page known to be full, is less than one body line', () => {
    const { points, lines } = roomLeft(pages(extract)[0], settings);

    expect(points).toBeGreaterThanOrEqual(0);
    expect(lines).toBeLessThan(1);
  });

  test('below a single line, is every line the full page held but one', () => {
    const { lines } = roomLeft(pages(extract)[1], settings);

    expect(Math.floor(lines)).toBe(44);
  });

  // pdfmake draws the glyphs at the top of the line box and leaves the leading below them. Measured
  // from the glyphs' bottom, the full page would show 7.6pt free: half a line nobody can use.
  test('ends a line where its box ends, not where its glyphs do', () => {
    const { points, bodyPitch } = roomLeft(pages(extract)[0], settings);

    expect(bodyPitch).toBeCloseTo(15.75, 1);
    expect(points).toBeCloseTo(3.1, 1);
  });

  test('a page with no text has nothing to measure from', () => {
    expect(() => roomLeft({ width: 612, height: 792, lines: [] }, settings)).toThrow(/no line/);
  });
});

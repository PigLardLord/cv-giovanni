/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { lineBox } from '../scripts/lib/font-metrics.mjs';
import { pages, roomLeft } from '../scripts/lib/room-left.mjs';

// `pdftotext -bbox-layout` of a document pdfmake built from 46 one-line paragraphs on LETTER, set the
// way the CV sets its body: Inter at 9.3pt, a line height of 1.4, 40pt top and bottom margins. Page one
// holds 45 lines — pdfmake had no room for the 46th and started page two with it — so page one is a
// page known to be full, and page two holds a single line (#49).
const extract = readFileSync(
  new URL('./fixtures/room-left/forty-six-lines.txt', import.meta.url),
  'utf8'
);
// The body type the document was set in, 9.3pt Inter, as the PDF audit gives it (#124).
const glyph =
  9.3 * lineBox(readFileSync(new URL('../vendor/fonts/inter/Inter-Regular.ttf', import.meta.url)));
const settings = { bottomMargin: 40, lineHeight: 1.4, glyph };

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

  // The downloadable PDF prints the day it was made in the bottom margin of its last page (#55). That line
  // is not content, and the room is measured above the margin, not above it.
  test('ignores a line printed in the bottom margin', () => {
    const [full] = pages(extract);
    const withFooter = { ...full, lines: [...full.lines, { top: 760, bottom: 770.5 }] };

    expect(roomLeft(withFooter, settings)).toEqual(roomLeft(full, settings));
  });

  // The code review of #49's merge found a tie on a sparse page settled by the order of its lines. The review of the
  // first fix found a one-page document tying the same way, and a page of labels outnumbering its body. The body type
  // is the design system's, not something to count on the page (#124).
  const body = (top) => ({ top, bottom: top + 11.253 });
  const heading = (top) => ({ top, bottom: top + 14 });
  const sparse = (lines) => ({ width: 612, height: 792, lines });

  test('a page whose line heights tie reads the same in either order, in body lines', () => {
    const listed = roomLeft(sparse([heading(700), body(720)]), settings);

    expect(roomLeft(sparse([body(720), heading(700)]), settings)).toEqual(listed);
    expect(listed.bodyPitch).toBeCloseTo(15.75, 2);
  });

  test('a page of labels is counted in body lines, not in the labels', () => {
    const labels = sparse([heading(600), heading(630), heading(660)]);

    expect(roomLeft(labels, settings).bodyPitch).toBeCloseTo(15.75, 2);
  });

  test('without the body type there is nothing to count in', () => {
    expect(() => roomLeft(pages(extract)[0], { bottomMargin: 40, lineHeight: 1.4 })).toThrow(
      /no body type/
    );
  });
});

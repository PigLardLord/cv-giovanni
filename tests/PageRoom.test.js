/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { PRINTED_PAGE, bboxPages, printedRoom, roomReport } from '../scripts/lib/page-room.mjs';

// The print audit said whether a layout fits two pages and nothing about how close it came to a third: after #159
// Nerd Mode's page 2 had 2.5pt free, measured by hand, and the next line added would have failed the page count at
// merge with no warning that the budget was that thin (#162).
const line = (yMin, yMax) =>
  `<line xMin="39" yMin="${yMin}" xMax="300" yMax="${yMax}"><word xMin="39" yMin="${yMin}" xMax="80" yMax="${yMax}">Text</word></line>`;
const page = (...lines) =>
  `<page width="595.92" height="841.92"><flow><block>${lines.join('')}</block></flow></page>`;
const extract = (...pages) => `<doc>${pages.join('')}</doc>`;

describe('the room left on a printed page', () => {
  test('reads each page of a pdftotext -bbox-layout extract and the lines on it', () => {
    const read = bboxPages(extract(page(line(40, 52), line(60, 72)), page(line(40, 52))));

    expect(read).toHaveLength(2);
    expect(read[0]).toEqual({
      width: 595.92,
      height: 841.92,
      lines: [
        { top: 40, bottom: 52 },
        { top: 60, bottom: 72 }
      ]
    });
  });

  test('is the space between the lowest line and the bottom margin, in points and in body lines', () => {
    const [nearlyFull] = bboxPages(extract(page(line(40, 52), line(794.31, 806.41))));

    const room = printedRoom(nearlyFull, { bottomMargin: 33, bodyLine: 15.4 });

    expect(room.points).toBeCloseTo(841.92 - 33 - 806.41, 5);
    expect(room.lines).toBeCloseTo((841.92 - 33 - 806.41) / 15.4, 5);
    expect(room.tight).toBe(true);
  });

  test('a page with a body line or more to spare is not tight, and a page just short of one is', () => {
    const roomFor = (points) =>
      printedRoom(bboxPages(extract(page(line(700, 841.92 - 33 - points))))[0], PRINTED_PAGE);

    expect(roomFor(40).tight).toBe(false);
    expect(roomFor(15.5).tight).toBe(false);
    expect(roomFor(15.3).tight).toBe(true);
  });

  test('a page with no line has nothing to measure from, and says so', () => {
    expect(() => printedRoom(bboxPages(extract(page()))[0], PRINTED_PAGE)).toThrow(/no line/);
  });

  test('reports every page, and warns about a last page with less than a body line free', () => {
    const rooms = [
      { points: 36.77, lines: 2.39, tight: false },
      { points: 2.51, lines: 0.16, tight: true }
    ];

    expect(roomReport(rooms)).toEqual({ column: 'p1 36.8pt · p2 2.5pt ⚠', lastPageTight: true });
    expect(roomReport([rooms[0], null])).toEqual({
      column: 'p1 36.8pt · p2 —',
      lastPageTight: false
    });
    expect(roomReport([{ points: 11.5, lines: 0.75, tight: true }, rooms[0]])).toEqual({
      column: 'p1 11.5pt · p2 36.8pt',
      lastPageTight: false
    });
  });

  // The audit reads no CSS; the page box and the running text it counts in are declared beside it, and held here to
  // what print.css says, so a change to either is a change to both.
  test('counts in the page box and the running text print.css declares', () => {
    const css = readFileSync(new URL('../print.css', import.meta.url), 'utf8');
    const pageMargin = /@page\s*\{[^}]*?margin:\s*([\d.]+)pt/.exec(css);
    const body = /\nbody\s*\{([^}]*)\}/.exec(css)[1];
    const size = Number(/font-size:\s*([\d.]+)pt/.exec(body)[1]);
    const height = Number(/line-height:\s*([\d.]+)/.exec(body)[1]);

    expect(PRINTED_PAGE.bottomMargin).toBe(Number(pageMargin[1]));
    expect(PRINTED_PAGE.bodyLine).toBeCloseTo(size * height, 5);
  });
});

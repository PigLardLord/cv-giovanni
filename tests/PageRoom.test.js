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

  // pdfmake's room check skipped a line in the bottom margin, where it printed the day it built the PDF. The printed
  // page puts nothing there, so a line there is text running past the page (the code review of #168).
  test('a line past the bottom margin is text running off the page: negative room, and tight', () => {
    const [overflowing] = bboxPages(extract(page(line(700, 712), line(815, 830))));

    const room = printedRoom(overflowing, PRINTED_PAGE);

    expect(room.points).toBeCloseTo(841.92 - 33 - 830, 5);
    expect(room.points).toBeLessThan(0);
    expect(room.tight).toBe(true);
  });

  test('a page with no line has nothing to measure from, and says so', () => {
    expect(() => printedRoom(bboxPages(extract(page()))[0], PRINTED_PAGE)).toThrow(/no line/);
  });

  test('reports every page, and warns about a last page with less than a body line free', () => {
    const rooms = [
      { points: 36.77, lines: 2.39, tight: false },
      { points: 2.51, lines: 0.16, tight: true }
    ];

    expect(roomReport(rooms)).toEqual({
      column: 'p1 36.8pt · p2 2.5pt ⚠',
      lastPageTight: true,
      tightBefore: []
    });
    expect(roomReport([rooms[0], null])).toEqual({
      column: 'p1 36.8pt · p2 —',
      lastPageTight: false,
      tightBefore: []
    });
  });

  // A tight page before the last fails nothing — the page count is the gate — but the next line added to it moves the
  // role below, whole, to the next page, and leaves this one's foot blank. #262 took Spotlight's page 1 to 6pt, and
  // nothing said so (#294).
  test('a tight page before the last is marked too, and named', () => {
    const roomy = { points: 185.5, lines: 12, tight: false };
    expect(roomReport([{ points: 6, lines: 0.4, tight: true }, roomy])).toEqual({
      column: 'p1 6.0pt ⚠ · p2 185.5pt',
      lastPageTight: false,
      tightBefore: [1]
    });
    expect(
      roomReport([
        { points: 6, lines: 0.4, tight: true },
        { points: 2.5, lines: 0.16, tight: true }
      ])
    ).toEqual({ column: 'p1 6.0pt ⚠ · p2 2.5pt ⚠', lastPageTight: true, tightBefore: [1] });
  });

  // The audit reads no CSS; the page box and the running text it counts in are declared beside it, and held here to
  // what print.css says, so a change to either is a change to both.
  // The review of #168: reading the first number of the shorthand passed a four-value margin whose bottom differed, and
  // a `@page :first` rule could change the bottom unseen. The shorthand is read the way CSS reads it, and no other page
  // rule may set a margin.
  test('counts in the page box and the running text print.css declares', () => {
    const css = readFileSync(new URL('../print.css', import.meta.url), 'utf8');
    const pageRules = [...css.matchAll(/@page([^{]*)\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
    const [, , declarations] = pageRules.find(([, selector]) => selector.trim() === '');
    const values = /(?:^|[;\s])margin:\s*([^;]+);/
      .exec(declarations)[1]
      .trim()
      .split(/\s+/)
      .map((value) => Number(/^([\d.]+)pt$/.exec(value)[1]));
    // top, right, bottom, left: one value is all four, two are vertical and horizontal, three leave left to right.
    const bottom = values.length <= 2 ? values[0] : values[2];
    const body = /\nbody\s*\{([^}]*)\}/.exec(css)[1];
    const size = Number(/font-size:\s*([\d.]+)pt/.exec(body)[1]);
    const height = Number(/line-height:\s*([\d.]+)/.exec(body)[1]);

    expect(pageRules.filter(([, selector]) => selector.trim() !== '')).toEqual([]);
    expect(declarations).not.toMatch(/margin-(top|bottom)\s*:/);
    expect(PRINTED_PAGE.bottomMargin).toBe(bottom);
    expect(PRINTED_PAGE.bodyLine).toBeCloseTo(size * height, 5);
  });
});

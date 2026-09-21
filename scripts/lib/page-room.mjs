/**
 * How much room a printed page has left below its last line, read from `pdftotext -bbox-layout` (#162).
 *
 * The print audit said whether a layout fits two pages and nothing about how close it came to a third. After #159,
 * Nerd Mode's page 2 had 2.5pt free, measured by hand, so the next line anyone added would fail the page count at
 * merge time with no earlier sign that the budget was that thin. Page 1's blank foot, where an achievement that does
 * not fit moves whole to page 2, went unreported too, so the two were never weighed together.
 */

/**
 * The page box and the running text the printed CV is laid out in, as `print.css` declares them: a 33pt margin at
 * the foot, and 11pt type on a 1.4 line height. The audit reads no CSS, so they are declared here, and
 * `tests/PageRoom.test.js` holds them to the stylesheet.
 */
export const PRINTED_PAGE = { bottomMargin: 33, bodyLine: 11 * 1.4 };

const attribute = (tag, name) => Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1]);

/**
 * Every page of an extract, with the vertical extent of each line on it.
 * @param {string} extract - What `pdftotext -bbox-layout` wrote
 * @returns {{ width: number, height: number, lines: { top: number, bottom: number }[] }[]} The pages
 */
export function bboxPages(extract) {
  return extract
    .split(/<page\b/)
    .slice(1)
    .map((page) => ({
      width: attribute(page, 'width'),
      height: attribute(page, 'height'),
      lines: [...page.matchAll(/<line\b[^>]*>/g)].map(([tag]) => ({
        top: attribute(tag, 'yMin'),
        bottom: attribute(tag, 'yMax')
      }))
    }));
}

/**
 * The room between a page's lowest line and its bottom margin, in points and in body lines.
 *
 * Measured from the lowest glyph box poppler gives, which is what the hand measurements of #159 used. A page is
 * tight when less than one body line of running text fits in it: the next line added to that page has nowhere to go.
 * Every line counts, one in the bottom margin too: the printed page puts nothing there on purpose, so a line there
 * is text running past the page, and its room is negative (the code review of #168).
 * @param {{ height: number, lines: { top: number, bottom: number }[] }} page - One page, from `bboxPages`
 * @param {{ bottomMargin: number, bodyLine: number }} settings - The page's bottom margin and one body line, in points
 * @returns {{ points: number, lines: number, tight: boolean }} The room left
 * @throws {Error} On a page with no line, which has no last line to measure from
 */
export function printedRoom({ height, lines }, { bottomMargin, bodyLine }) {
  if (!lines.length) throw new Error('A page with no line has no last line to measure from.');

  const points = height - bottomMargin - Math.max(...lines.map(({ bottom }) => bottom));
  return { points, lines: points / bodyLine, tight: points < bodyLine };
}

/**
 * The report's words for a layout's room: every page's room in points, each tight page marked. Neither is a failure,
 * since the page count is the gate, but they warn of different things: a tight last page is the one the next line
 * spills from, onto a page too many; a tight page before it moves the role below, whole, to the next page, and leaves
 * its own foot blank (#294).
 * @param {({ points: number, tight: boolean }|null)[]} rooms - Each page's room, in order; null for a page with no
 *   line to measure from
 * @returns {{ column: string, lastPageTight: boolean, tightBefore: number[] }} The table cell, whether the last page
 *   is tight, and the number of each tight page before it
 */
export function roomReport(rooms) {
  const last = rooms.length - 1;
  const lastPageTight = rooms.length > 0 && Boolean(rooms[last]?.tight);
  const tightBefore = rooms
    .map((room, index) => (index < last && room?.tight ? index + 1 : null))
    .filter((page) => page !== null);
  const column = rooms
    .map(
      (room, index) =>
        `p${index + 1} ${room ? `${room.points.toFixed(1)}pt${room.tight ? ' ⚠' : ''}` : '—'}`
    )
    .join(' · ');
  return { column, lastPageTight, tightBefore };
}

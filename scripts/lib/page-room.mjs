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
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoded = (text) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] !== '#') return ENTITIES[name] ?? entity;
    const hex = name[1].toLowerCase() === 'x';
    return String.fromCodePoint(hex ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  });

/**
 * Every page of an extract, with the box of each line on it and the words it carries. A line is told by what it says
 * as well as by where it is: the running footer is left out of the room by its text (#158).
 * @param {string} extract - What `pdftotext -bbox-layout` wrote
 * @returns {{ width: number, height: number, lines: { top: number, bottom: number, left: number, right: number,
 *   text: string }[] }[]} The pages, each line's words joined by single spaces
 */
export function bboxPages(extract) {
  return extract
    .split(/<page\b/)
    .slice(1)
    .map((page) => ({
      width: attribute(page, 'width'),
      height: attribute(page, 'height'),
      lines: [...page.matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/g)].map(([, tag, body]) => ({
        top: attribute(tag, 'yMin'),
        bottom: attribute(tag, 'yMax'),
        left: attribute(tag, 'xMin'),
        right: attribute(tag, 'xMax'),
        text: [...body.matchAll(/<word\b[^>]*>([^<]*)<\/word>/g)]
          .map(([, word]) => decoded(word).trim())
          .filter(Boolean)
          .join(' ')
      }))
    }));
}

/**
 * The room between a page's lowest line and its bottom margin, in points and in body lines.
 *
 * Measured from the lowest glyph box poppler gives, which is what the hand measurements of #159 used. A page is
 * tight when less than one body line of running text fits in it: the next line added to that page has nowhere to go.
 * Every line it is given counts, one in the bottom margin too, so a line there is text running past the page, and its
 * room is negative (the code review of #168). The one line the printed page puts there on purpose is the running
 * footer, from page 2 on (#158): the audit leaves it out by what it says before measuring, with
 * `withoutRunningFooter`, and never by where it is.
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
 * The report's words for a layout's room: every page's room in points, and a warning on a tight last page. A tight
 * page 1 is not warned about, since the page count, not the room, is the gate, and a tight last page is the one
 * the next line spills from.
 * @param {({ points: number, tight: boolean }|null)[]} rooms - Each page's room, in order; null for a page with no
 *   line to measure from
 * @returns {{ column: string, lastPageTight: boolean }} The table cell, and whether the last page is tight
 */
export function roomReport(rooms) {
  const lastPageTight = rooms.length > 0 && Boolean(rooms[rooms.length - 1]?.tight);
  const column = rooms
    .map((room, index) => `p${index + 1} ${room ? `${room.points.toFixed(1)}pt` : '—'}`)
    .join(' · ');
  return { column: lastPageTight ? `${column} ⚠` : column, lastPageTight };
}

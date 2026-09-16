/**
 * How much room a page has left below its last line, read from `pdftotext -bbox-layout` (#49).
 *
 * Whether a copy change fits used to be found out after the fact, by building and counting pages: #43
 * took seven builds to learn that one description line pushed spotlight on LETTER to a third page.
 *
 * pdfmake sets each line in a box as tall as the font's height times the line height, and draws the
 * glyphs at the top of that box. Measured on Inter at 9.3pt and a line height of 1.4: glyphs 11.253pt
 * tall, one line every 15.754pt, the first line's top exactly on the 40pt margin. So a line ends at its
 * top plus its glyph height times the line height, and a page is full when less than one body line fits
 * between there and the bottom margin. Measured from the glyphs' bottom instead, a full page shows the
 * 4.5pt of leading under its last line as room nobody can use.
 */

const attribute = (tag, name) => Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1]);

/**
 * Every page of an extract, with the vertical extent of each line on it.
 * @param {string} extract - What `pdftotext -bbox-layout` wrote
 * @returns {{ width: number, height: number, lines: { top: number, bottom: number }[] }[]} The pages
 */
export function pages(extract) {
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
 * The glyph height of the type most lines are set in, across the pages given: the body type, since titles, labels
 * and dates come in other sizes.
 *
 * A page alone can tie. A sparse last page with one heading line and one body line has two heights, once each, and
 * a sort kept whichever the extract listed first, so the same page measured differently in another order (#124).
 * Read across a whole document, the body type outnumbers every other. Where heights still tie, no body type can be
 * told, and this says so rather than pick one.
 * @param {{ lines: { top: number, bottom: number }[] }[]} pages - Pages from `pages`
 * @returns {number} The glyph height, in points
 * @throws {Error} When the pages hold no line, or two heights are equally common
 */
export function bodyGlyph(pages) {
  const counts = new Map();
  for (const { lines } of pages) {
    for (const { top, bottom } of lines) {
      const glyph = (bottom - top).toFixed(2);
      counts.set(glyph, (counts.get(glyph) || 0) + 1);
    }
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) throw new Error('Pages with no line have no body type.');
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    throw new Error(
      `No body type can be told: ${ranked[0][0]}pt and ${ranked[1][0]}pt glyphs are equally common.`
    );
  }
  return Number(ranked[0][0]);
}

/**
 * The room between a page's lowest line and its bottom margin, in points and in body lines.
 *
 * A body line is the pitch of the body type: its glyph height, times the line height. Titles, labels and dates
 * come in other sizes, but the lines a copy change adds to a CV are body lines. The glyph height is the document's,
 * from `bodyGlyph`, when the caller has it; a page read alone takes its own, and refuses a tie.
 * @param {{ height: number, lines: { top: number, bottom: number }[] }} page - One page, from `pages`
 * @param {{ bottomMargin: number, lineHeight: number, glyph?: number }} settings - What the document was laid out
 *   with, and the glyph height of its body type
 * @returns {{ points: number, lines: number, bodyPitch: number }} The room left
 */
export function roomLeft({ height, lines: all }, { bottomMargin, lineHeight, glyph }) {
  // A line that starts inside the bottom margin is not content: the downloadable PDF prints the day it was
  // made there (#55), and the room is measured above the margin.
  const lines = all.filter(({ top }) => top < height - bottomMargin);
  if (!lines.length) throw new Error('A page with no line has no last line to measure from.');

  const bodyPitch = (glyph ?? bodyGlyph([{ lines }])) * lineHeight;

  const lowest = Math.max(...lines.map(({ top, bottom }) => top + (bottom - top) * lineHeight));
  const points = height - bottomMargin - lowest;
  return { points, lines: points / bodyPitch, bodyPitch };
}

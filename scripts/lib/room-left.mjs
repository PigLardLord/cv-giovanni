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

/** Every page of an extract, with the vertical extent of each line on it: the reader the print audit uses too (#162). */
export { bboxPages as pages } from './page-room.mjs';

/**
 * The room between a page's lowest line and its bottom margin, in points and in body lines.
 *
 * A body line is the body type's line box times the line height. Titles, labels and dates come in other sizes, but the
 * lines a copy change adds to a CV are body lines. The line box comes from the size and the font the document was set
 * in (`lineBox`, in `font-metrics.mjs`), never from counting the page's lines: a sparse page can tie, and a page of
 * labels outnumbers its body (#124).
 * @param {{ height: number, lines: { top: number, bottom: number }[] }} page - One page, from `pages`
 * @param {{ bottomMargin: number, lineHeight: number, glyph: number }} settings - What the document was laid out
 *   with: its bottom margin, its line height, and its body type's line box in points
 * @returns {{ points: number, lines: number, bodyPitch: number }} The room left
 */
export function roomLeft({ height, lines: all }, { bottomMargin, lineHeight, glyph }) {
  if (!(glyph > 0)) {
    throw new Error('The room is counted in body lines, and no body type was given to count in.');
  }
  // A line that starts inside the bottom margin is not content: the downloadable PDF prints the day it was
  // made there (#55), and the room is measured above the margin.
  const lines = all.filter(({ top }) => top < height - bottomMargin);
  if (!lines.length) throw new Error('A page with no line has no last line to measure from.');

  const bodyPitch = glyph * lineHeight;

  const lowest = Math.max(...lines.map(({ top, bottom }) => top + (bottom - top) * lineHeight));
  const points = height - bottomMargin - lowest;
  return { points, lines: points / bodyPitch, bodyPitch };
}

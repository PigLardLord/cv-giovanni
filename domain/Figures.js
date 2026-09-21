/**
 * What a figure is, in a line of the CV: the rule the renderers read, so no renderer guesses from digits (#261).
 *
 * - A figure is a numeral as the CV writes it: with its sign of approximation or bound (`~30k`, `<0.1%`), its
 *   separators in either language (`1,040`, `30.000`, `37.7`, `5,2`), its scale (`k`, `M`) and its unit symbol
 *   (`%`, `14 %` as DIN 5008 spaces it, `+`).
 * - A change is two figures and the arrow between them, `1040 → 5308`, `14% → 83%`: one figure, read whole.
 * - A year standing alone is a date, not a figure: "since 2021" states when, not how much.
 *
 * A figure is never part of a name: "iOS17", "v2.0" and "B2B" hold none.
 */

// A percent sign may stand after a space, as DIN 5008 sets it: "14 % → 83 %" is one change (the review of #328).
const NUMERAL = String.raw`[~≈<>]?\d+(?:[.,]\d+)*(?:[kKM](?![\p{L}]))?(?:[ \u00A0\u202F]?%)?\+?`;
const FIGURE = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,])${NUMERAL}(?:\s*→\s*${NUMERAL})?(?![\p{L}\p{N}])`,
  'gu'
);
const YEAR = /^(?:19|20)\d{2}$/;

/**
 * A line in pieces, each a figure or the text between figures, in order: joined, they are the line as written.
 * @param {string} text - A line of the CV
 * @returns {{ text: string, figure: boolean }[]} The pieces
 */
export function figurePieces(text) {
  const value = String(text ?? '');
  const pieces = [];
  let at = 0;
  for (const match of value.matchAll(FIGURE)) {
    if (YEAR.test(match[0])) continue;
    if (match.index > at) pieces.push({ text: value.slice(at, match.index), figure: false });
    pieces.push({ text: match[0], figure: true });
    at = match.index + match[0].length;
  }
  if (at < value.length) pieces.push({ text: value.slice(at), figure: false });
  return pieces;
}

/**
 * The figures of a line, as written.
 * @param {string} text - A line of the CV
 * @returns {string[]} Each figure and each change, in order
 */
export function figuresIn(text) {
  return figurePieces(text)
    .filter(({ figure }) => figure)
    .map(({ text: figure }) => figure);
}

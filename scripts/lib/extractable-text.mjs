/**
 * Whether a printed page's text survives the extractors that read it without laying the page out (#143).
 *
 * Chrome embeds a variable web font as Type 3 fonts, each a set of drawn glyphs with a Unicode map on the
 * side, and several extractors have documented bugs with them. And a parser that reads in drawing order,
 * as PDFBox and Tika do by default, finds a word's end only where the page drew a space: the browser's
 * print gave it "MobileSoftwareEngineer" and "GiovanniTrovato".
 *
 * This module reads `pdffonts` and `pdftotext -raw` output and nothing else, so each rule can be shown to
 * fail on a page that breaks it.
 */

/**
 * @param {string} pdffonts - The output of `pdffonts` for one PDF
 * @returns {string[]} The name of every Type 3 font it embeds
 */
export function type3Fonts(pdffonts) {
  // pdffonts pads a name to its column but never cuts a longer one, so the columns after the name shift with it.
  // They are fixed in width from the row's end, and are read from there: a name can hold spaces, and even "Type 3".
  const [header = '', , ...rows] = pdffonts.split('\n');
  const typeFromEnd = header.length - header.indexOf('type');
  const encodingFromEnd = header.length - header.indexOf('encoding');
  return rows
    .filter((row) => row.trim())
    .filter(
      (row) => row.slice(row.length - typeFromEnd, row.length - encodingFromEnd).trim() === 'Type 3'
    )
    .map((row) => row.slice(0, row.length - typeFromEnd).trim());
}

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The phrases a drawing-order read of the page runs together.
 *
 * A phrase is found with any whitespace between its words, a line break included; it is glued when any of
 * those gaps is empty. A phrase the text does not carry at all is the content check's to report.
 * @param {string} raw - The text layer in drawing order, from `pdftotext -raw`
 * @param {string[]} phrases - Text the profile writes with spaces in it: the name, titles, schools
 * @returns {string[]} The phrases whose words run together somewhere in the text
 */
export function gluedPhrases(raw, phrases) {
  return phrases.filter((phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    const pattern = new RegExp(words.map(escapeForRegExp).join('(\\s*)'), 'g');
    return [...raw.matchAll(pattern)].some((match) => match.slice(1).some((gap) => gap === ''));
  });
}

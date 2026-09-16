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

// Every type pdffonts names, longest first so a longer name is not read as its prefix.
const FONT_TYPES = [
  'CID TrueType (OT)',
  'CID Type 0C (OT)',
  'TrueType (OT)',
  'Type 1C (OT)',
  'CID TrueType',
  'CID Type 0C',
  'CID Type 0',
  'TrueType',
  'Type 1C',
  'Type 1',
  'Type 3',
  'unknown'
];
const FONT_ROW = new RegExp(
  `^(.*?)\\s+(${FONT_TYPES.map((type) => type.replace(/[()]/g, '\\$&')).join('|')})\\s+\\S+\\s+(?:yes|no)\\s+(?:yes|no)\\s+(?:yes|no)\\s`
);

/**
 * @param {string} pdffonts - The output of `pdffonts` for one PDF
 * @returns {string[]} The name of every Type 3 font it embeds
 */
export function type3Fonts(pdffonts) {
  // A row is read by what its fields are, not where they sit: pdffonts widens any column a value overruns, the
  // name, the encoding or the object number, and moves every column after it (the reviews of #156). A name can
  // hold spaces, even "Type 3"; the type is the one followed by an encoding and three yes-or-no columns.
  return pdffonts
    .split('\n')
    .slice(2)
    .map((row) => FONT_ROW.exec(row))
    .filter((match) => match && match[2] === 'Type 3')
    .map((match) => match[1].trim());
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

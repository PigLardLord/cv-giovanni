/**
 * The paper and the kind of document a generated PDF is, read from the end of its name.
 *
 * `core/PdfExporter.js` and `core/LetterExporter.js` end every variant's name the same way:
 * `-<layout>[-cover]-<a4|letter>-<color|monochrome>.pdf`. The name begins with the profile, and a
 * profile can be named with the very words a variant is made of — an application called `zz-letter`
 * made every A4 file look like US Letter to a check that searched the whole name (#79). So only the
 * end is read.
 */
const ENDING = /-(cover-)?(a4|letter)-(color|monochrome)\.pdf$/;

/**
 * @param {string} filename - A generated variant's filename
 * @returns {{ paper: 'a4'|'letter', coverLetter: boolean }} What the name says the file is
 * @throws {Error} When the name does not end the way the exporters end it: guessing is how #79 happened
 */
export function pdfVariant(filename) {
  const match = ENDING.exec(filename);
  if (!match) {
    throw new Error(`${filename} does not end in -<a4|letter>-<color|monochrome>.pdf`);
  }
  return { paper: match[2], coverLetter: Boolean(match[1]) };
}

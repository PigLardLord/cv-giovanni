/**
 * Whether a printed CV's text layer gives its sections in the order a reader meets them (#142).
 *
 * The browser's print set Education in a column beside the first role, and its text layer put the degrees
 * between that role's achievements; read in drawing order, the name came after the skills. A parser meets
 * the sections in whatever order the text layer gives, so the order is checked on the text, both as poppler
 * reconstructs it and as the PDF draws it.
 *
 * This module reads extracted text and `pdfimages -list` output and nothing else, so each rule can be shown
 * to fail on a text that breaks it.
 */

/**
 * @param {string} text - A text layer, from `pdftotext` or `pdftotext -raw`
 * @param {string[]} anchors - Strings the CV writes, in the order a reader meets them
 * @returns {string[]} Every anchor the text lacks, or gives before the anchor it should follow
 */
export function outOfOrder(text, anchors) {
  const flat = text.replace(/\s+/g, ' ');
  const findings = [];
  let previous = null;
  for (const anchor of anchors) {
    const at = flat.indexOf(anchor.replace(/\s+/g, ' '));
    if (at < 0) {
      findings.push(`"${anchor}" is missing`);
      continue;
    }
    if (previous && at < previous.at)
      findings.push(`"${anchor}" comes before "${previous.anchor}"`);
    previous = { anchor, at };
  }
  return findings;
}

/**
 * @param {string} list - The output of `pdfimages -list` for one PDF
 * @returns {number} The images it embeds: a portrait, a logo, a picture of text
 */
export function imageCount(list) {
  return list
    .split('\n')
    .slice(2)
    .filter((row) => row.trim()).length;
}

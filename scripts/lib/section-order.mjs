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
    const wanted = anchor.replace(/\s+/g, ' ');
    // Each anchor is looked for after the one before it: a summary that says "Education" is not the section.
    const after = previous
      ? flat.indexOf(wanted, previous.at + previous.anchor.length)
      : flat.indexOf(wanted);
    if (after >= 0) {
      previous = { anchor, at: after };
      continue;
    }
    const anywhere = flat.indexOf(wanted);
    if (anywhere < 0) {
      findings.push(`"${anchor}" is missing`);
      continue;
    }
    findings.push(`"${anchor}" comes before "${previous.anchor}"`);
    previous = { anchor, at: anywhere };
  }
  return findings;
}

/**
 * @param {string} list - The output of `pdfimages -list` for one PDF
 * @returns {number} The images it embeds: a portrait, a logo, a picture of text
 */
export function imageCount(list) {
  // A soft mask is listed on a row of its own beside its image; only the image rows count.
  return list
    .split('\n')
    .slice(2)
    .filter((row) => row.trim().split(/\s+/)[2] === 'image').length;
}

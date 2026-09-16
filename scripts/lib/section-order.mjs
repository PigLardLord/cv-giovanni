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

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} text - A text layer, from `pdftotext` or `pdftotext -raw`
 * @param {(string | { heading: string })[]} anchors - What the CV writes, in the order a reader meets it. A string
 *   is found anywhere in the text, across line breaks; a heading only as a line of its own, so a word in the body
 *   is not taken for the section (the reviews of #156)
 * @returns {string[]} Every anchor the text lacks, or gives before the anchor it should follow
 */
export function outOfOrder(text, anchors) {
  // Each line with its whitespace collapsed; the same text with the breaks as spaces keeps every position.
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n');
  const flat = lines.replace(/\n/g, ' ');
  const locate = (anchor) => {
    if (typeof anchor === 'string') return flat.indexOf(anchor.replace(/\s+/g, ' ').trim());
    const line = new RegExp(`(^|\\n)${escapeForRegExp(anchor.heading)}(?=\\n|$)`).exec(lines);
    return line ? line.index + line[1].length : -1;
  };
  const findings = [];
  let previous = null;
  for (const anchor of anchors) {
    const name = typeof anchor === 'string' ? anchor : anchor.heading;
    const at = locate(anchor);
    if (at < 0) {
      findings.push(`"${name}" is missing`);
      continue;
    }
    if (previous && at < previous.at) findings.push(`"${name}" comes before "${previous.name}"`);
    previous = { name, at };
  }
  return findings;
}

/**
 * @param {string} list - The output of `pdfimages -list` for one PDF
 * @returns {number} The images it embeds: a portrait, a logo, a picture of text
 */
export function imageCount(list) {
  // A mask or soft mask is listed on a row of its own beside the image it belongs to; a stencil is an image drawn as
  // ink through a one-bit mask, with no image row of its own, and counts.
  return list
    .split('\n')
    .slice(2)
    .filter((row) => ['image', 'stencil'].includes(row.trim().split(/\s+/)[2])).length;
}

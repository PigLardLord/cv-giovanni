export const SEPARATOR_GLYPH = '·';

const NO_BREAK_SPACE = '\u00A0';

/**
 * Build the decorative separator that sits between two inline items.
 *
 * A CSS `content: ' · '` separator is not safe for print: Chromium collapses
 * the generated whitespace when it lays the page out, welding the two items
 * together in the PDF. A real element carries real margins that survive.
 *
 * The element is an atomic inline box, so the line may break on either side of
 * it: use it only inside a line that cannot wrap. Anywhere a line is free to
 * wrap, `joinSeparated` / `bindSeparators` are the safe form.
 * @param {Document} root - DOM root
 * @param {string} glyph - Separator glyph
 * @returns {Element} Separator element
 */
export function createSeparatorElement(root, glyph = SEPARATOR_GLYPH) {
  const separator = root.createElement('span');
  separator.className = 'inline-separator';
  separator.textContent = glyph;
  separator.setAttribute('aria-hidden', 'true');
  return separator;
}

/**
 * Join parts into one text line whose separators cannot land at a line edge.
 *
 * The spaces around the glyph are the line's break opportunities, so an
 * ordinary space either side lets a wrap strand the separator at the end of one
 * line or the start of the next — where it reads as a typo. No-break spaces
 * leave the line free to wrap between words and nowhere else.
 * @param {string[]} parts - Items to join
 * @param {string} glyph - Separator glyph
 * @returns {string} Joined line
 */
export function joinSeparated(parts, glyph = SEPARATOR_GLYPH) {
  return parts.join(`${NO_BREAK_SPACE}${glyph}${NO_BREAK_SPACE}`);
}

/**
 * Bind every separator already present in a line of text to its neighbours.
 *
 * The counterpart of `joinSeparated` for copy that arrives pre-joined from the
 * data, which we do not own and must not reword: only the spacing around each
 * glyph changes — it ends up with a no-break space either side whether or not
 * the data wrote one — so the line reads as written but can no longer break
 * beside a separator.
 * @param {string} text - Line as the data wrote it
 * @param {string} glyph - Separator glyph
 * @returns {string} Line with every separator bound to its neighbours
 */
export function bindSeparators(text, glyph = SEPARATOR_GLYPH) {
  if (typeof text !== 'string') return '';

  const spaced = new RegExp(`[^\\S\\r\\n]*${escapeForRegExp(glyph)}[^\\S\\r\\n]*`, 'g');
  return text.replace(spaced, `${NO_BREAK_SPACE}${glyph}${NO_BREAK_SPACE}`);
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

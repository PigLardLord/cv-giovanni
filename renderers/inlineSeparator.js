import { SEPARATOR_GLYPHS } from '../domain/Separators.js';

/** The glyph between two inline items. */
const SEPARATOR_GLYPH = '·';

/**
 * Build the decorative separator that sits between two inline items.
 *
 * A CSS `content: ' · '` separator is not safe for print: Chromium collapses
 * the generated whitespace when it lays the page out, welding the two items
 * together in the PDF. A real element carries real margins that survive.
 *
 * A margin is room on the page and no character in the file, so a reader in
 * drawing order gets the addresses as one token — filed as its own ticket,
 * since the spaces that would fix it run the line past its column at 10pt.
 *
 * The element is an atomic inline box, so the line may break on either side of
 * it: use it only inside a line that cannot wrap. Anywhere a line is free to
 * wrap, `holdSeparators` is the safe form.
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

/** A separator glyph with the spaces the data wrote either side of it. */
const SEPARATED = new RegExp(`(\\s*[${SEPARATOR_GLYPHS.join('')}]\\s*)`, 'u');

/**
 * A line of text as pieces, with every separator held to the words either side of it (#180).
 *
 * The spaces around a separator are where a line breaks, so a wrap stranded one at the edge of a line: "– Google
 * (2026)" opened a line on screen, and "Enterprise Mobility ·" ended one. Each separator goes into a `no-break` span
 * with its spaces, and a space inside that span is no place to break, so the words either side travel with it. The
 * text is untouched: a no-break space written into it would reach a copy and a parser.
 * @param {Document} root - DOM root
 * @param {string} text - Text as the data wrote it
 * @returns {(string|Element)[]} The text, with a `no-break` span for each separator
 */
export function holdSeparators(root, text) {
  return String(text ?? '')
    .split(SEPARATED)
    .map((piece, index) => {
      if (index % 2 === 0 || !piece) return piece;
      const held = root.createElement('span');
      held.className = 'no-break';
      held.textContent = piece;
      return held;
    })
    .filter((piece) => piece !== '');
}

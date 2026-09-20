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

/** The word a held run takes from the text before it; the word it takes from the text after it. */
const [WORD_BEFORE, WORD_AFTER] = [/\S+$/u, /^\S+/u];

/**
 * A line of text as pieces, with every separator held to the words either side of it (#180).
 *
 * The spaces around a separator are where a line breaks, so a wrap stranded one at the edge of a line: "– Google
 * (2026)" opened a line on screen, and "Enterprise Mobility ·" ended one. Each separator goes into a `no-break` span
 * with its spaces, and a space inside that span is no place to break, so the words either side travel with it. The
 * text is untouched: a no-break space written into it would reach a copy and a parser.
 *
 * A separator the data wrote with no space has no such space to hold, and the span then held the glyph alone — an
 * atomic box a line may still break after, because Unicode allows a break after a dash. "2014—" ended a line and
 * "2016" opened the next. So on a side the data wrote no space, the run takes the word there instead, and
 * "2014—2016" is held whole (#232).
 * @param {Document} root - DOM root
 * @param {string} text - Text as the data wrote it
 * @returns {(string|Element)[]} The text, with a `no-break` span for each run a separator holds
 */
export function holdSeparators(root, text) {
  const pieces = String(text ?? '').split(SEPARATED);
  for (let at = 1; at < pieces.length; at += 2) {
    const separator = pieces[at];
    if (!/^\s/u.test(separator)) {
      const [word] = WORD_BEFORE.exec(pieces[at - 1]) ?? [];
      if (word) {
        pieces[at - 1] = pieces[at - 1].slice(0, -word.length);
        pieces[at] = word + pieces[at];
      }
    }
    if (!/\s$/u.test(separator)) {
      const [word] = WORD_AFTER.exec(pieces[at + 1] ?? '') ?? [];
      if (word) {
        pieces[at + 1] = pieces[at + 1].slice(word.length);
        pieces[at] += word;
      }
    }
  }

  const laid = [];
  pieces.forEach((piece, at) => {
    if (!piece) return;
    if (at % 2 === 0) {
      laid.push(piece);
      return;
    }
    // Two separators with no text left between them — because they took the same word, or because the data wrote
    // them consecutively — leave nowhere to break at either, so they are one run.
    const open = laid[laid.length - 1];
    if (open && typeof open !== 'string' && !pieces[at - 1]) {
      open.textContent += piece;
      return;
    }
    const held = root.createElement('span');
    held.className = 'no-break';
    held.textContent = piece;
    laid.push(held);
  });
  return laid;
}

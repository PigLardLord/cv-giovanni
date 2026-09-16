/**
 * The line that says whose CV a printed page belongs to, from page 2 on (#158).
 *
 * Page 2 of the printed CV opened on a role, with nothing saying whose CV it was or that a page 1 existed, and a page
 * that reaches a desk on its own is read on its own. The line names the candidate and the document, in the
 * catalogue's words, then the page and the page count: "Ada Lovelace · CV · 2/2".
 *
 * Two readers need it: the renderer that hands it to the printed page, and the print audit, which looks for it on the
 * paper. Both ask here. The page count is known only once the browser has laid the page out, so a page number is not
 * text but a counter, and the line is given as parts: the text around the counters, and each counter by name. How the
 * parts are printed, and where, is the renderer's and the stylesheet's.
 */

// Two private-use characters stand in the catalogue's line for the counters, and the line is split on them. A name
// cannot write either: one that did would place a page number of its own.
const PAGE = '';
const PAGES = '';
const MARKERS = /[]/g;

/**
 * The running footer's parts, in the order they print.
 * @param {string|null|undefined} name - The candidate's name, from `CvDocument.identity.name`
 * @param {(key: string, values?: object) => string} t - The catalogue, which fills `{{placeholders}}` as i18next does
 * @returns {(string|{ counter: 'page'|'pages' })[]} The text and the counters; none for a profile without a name,
 *   whose footer would name nobody, or for a catalogue that writes no page count
 */
export function runningFooterParts(name, t) {
  const written = String(name ?? '').replace(MARKERS, '');
  if (!written.trim()) return [];

  const line = t('print:footer', {
    name: written,
    documentKind: t('print:documentKind'),
    page: PAGE,
    pageCount: PAGES
  });
  // i18next gives back the key it cannot find, and "print:footer" is not a line to print.
  if (!line.includes(PAGE) || !line.includes(PAGES)) return [];

  return line
    .split(/([])/)
    .filter(Boolean)
    .map((part) =>
      part === PAGE ? { counter: 'page' } : part === PAGES ? { counter: 'pages' } : part
    );
}

/**
 * The footer as it reads on one page of a printed document.
 * @param {(string|{ counter: 'page'|'pages' })[]} parts - From `runningFooterParts`
 * @param {number} page - The page it is printed on, from 1
 * @param {number} pageCount - The document's pages
 * @returns {string} The line; empty when there are no parts
 */
export function runningFooterText(parts, page, pageCount) {
  return parts
    .map((part) =>
      typeof part === 'string' ? part : String(part.counter === 'page' ? page : pageCount)
    )
    .join('');
}

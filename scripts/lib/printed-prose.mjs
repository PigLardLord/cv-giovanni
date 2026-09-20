/**
 * How many printed lines each sentence of the CV takes, and which pages it takes them on (#230).
 *
 * The measure (`line-length.mjs`) asks how far a line runs; this asks how far a sentence runs. A neutral read of the
 * printed CV found bullets of 34 to 43 words set over three and four lines, which a recruiter skimming for six
 * seconds does not read, and page 2 opening on three bullets with no role or employer above them: the reader meets
 * evidence with nothing to attach it to. Both are visible only on the artefact, since the same profile wraps
 * differently in each layout, so they are measured here on the text layer rather than asserted on the source.
 */

import { bboxLines } from './line-length.mjs';

const squash = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Every page of a text layer, as its squashed lines.
 * @param {string} text - The text layer, from `pdftotext`, pages separated by form feeds
 * @returns {{ page: number, lines: string[] }[]} The pages
 */
export function printedPages(text) {
  return String(text)
    .split('\f')
    .map((page, index) => ({
      page: index + 1,
      lines: page.split('\n').map(squash).filter(Boolean)
    }));
}

/** Every line of the print, each with the page it is on. A sentence may run from one page's last line to the next. */
const printedLines = (text) =>
  printedPages(text).flatMap(({ page, lines }) => lines.map((line) => ({ page, text: line })));

/**
 * What a line can open a sentence with: the line itself, and what follows a period poppler set at its start. Nerd
 * Mode prints each role's dates in a column beside the role, and poppler joins that column's last word to the prose
 * beside it, "Present Enterprise mobility and…" (the code review of #177).
 */
const openings = (line, periods) => {
  const words = line.split(' ');
  const rest = [];
  for (let cut = 1; cut < words.length; cut += 1) {
    if (!periods.some((period) => period.includes(words.slice(0, cut).join(' ')))) break;
    rest.push(words.slice(cut).join(' '));
  }
  return [line, ...rest];
};

/**
 * Each sentence as it printed: where it starts, how many lines it is set over, and the pages it reaches.
 *
 * A sentence the text layer does not hold comes back `found: false` rather than silently passing a check: a bullet
 * that never printed takes no lines at all.
 * @param {string} text - The text layer, from `pdftotext`
 * @param {string[]} sentences - The sentences to look for, as the profile writes them
 * @param {{ periods?: string[] }} [options] - Each role's dates as they print, for Nerd Mode's date column
 * @returns {{ text: string, found: boolean, page: number|null, lines: number|null, pages: number[] }[]} One a sentence
 */
export function proseSpans(text, sentences, { periods = [] } = {}) {
  const lines = printedLines(text);
  const written = periods.map(squash);
  return sentences.map(squash).map((sentence) => {
    for (let at = 0; at < lines.length; at += 1) {
      for (const opening of openings(lines[at].text, written)) {
        if (!opening || !sentence.startsWith(opening)) continue;
        let said = opening;
        let count = 1;
        while (said !== sentence && at + count < lines.length) {
          const next = `${said} ${lines[at + count].text}`;
          if (!sentence.startsWith(next)) break;
          said = next;
          count += 1;
        }
        if (said === sentence) {
          const over = lines.slice(at, at + count);
          return {
            text: sentence,
            found: true,
            page: over[0].page,
            lines: count,
            pages: [...new Set(over.map((line) => line.page))]
          };
        }
      }
    }
    return { text: sentence, found: false, page: null, lines: null, pages: [] };
  });
}

/**
 * The pages a role is printed across: the page its header stands on, and every page its own sentences reach.
 *
 * A role is found by its header, the one line that names both the title and the employer, so a title said again in
 * the summary is not taken for the role (#213).
 * @param {string} text - The text layer, from `pdftotext`
 * @param {{ title: string, company: string, prose: string[] }[]} roles - Each role and what it says
 * @param {{ periods?: string[] }} [options] - Each role's dates as they print
 * @returns {{ title: string, company: string, header: number|null, pages: number[] }[]} One entry a role
 */
export function rolePages(text, roles, options) {
  const pages = printedPages(text);
  return roles.map((role) => {
    const header =
      pages.find(({ lines }) =>
        lines.some((line) => line.includes(role.title) && line.includes(role.company))
      )?.page ?? null;
    const spans = proseSpans(text, role.prose, options).filter((span) => span.found);
    return {
      title: role.title,
      company: role.company,
      header,
      pages: [...new Set(spans.flatMap((span) => span.pages))].sort((a, b) => a - b)
    };
  });
}

/**
 * The roles whose own sentences run onto a page after the one their header stands on.
 *
 * Page 2 of the printed CV opened on three bullets under no heading, and a reader who turns the page meets evidence
 * with nothing to attach it to: no employer, no title, no dates. The break belongs between two roles.
 * @param {string} text - The text layer, from `pdftotext`
 * @param {{ title: string, company: string, prose: string[] }[]} roles - Each role and what it says
 * @param {{ periods?: string[] }} [options] - Each role's dates as they print
 * @returns {{ title: string, company: string, header: number|null, pages: number[] }[]} The roles that straddle
 */
export function straddlingRoles(text, roles, options) {
  return rolePages(text, roles, options).filter(
    ({ header, pages }) => header !== null && pages.some((page) => page !== header)
  );
}

/**
 * The lines of the masthead that do not start on the page's left edge.
 *
 * `HeaderRenderer` writes each contact as a hidden label and a value that opens with a space, and print.css draws the
 * separator in the label's place. The first label on a line has no separator to draw, so its value kept the space and
 * the email line printed 2.8pt — one space at 10pt — to the right of every line above and below it. A neutral read of
 * the printed CV saw it before any check did (#230).
 * @param {string} extract - What `pdftotext -bbox-layout` wrote
 * @param {{ until: string, tolerance?: number }} options - The first heading under the masthead, and what counts as
 *   rounding rather than a ragged edge
 * @returns {{ left: number, edge: number, text: string }[]} Every masthead line that starts past the edge
 */
export function raggedMasthead(extract, { until, tolerance = 0.5 }) {
  const lines = bboxLines(extract).filter(({ page }) => page === 1);
  const heading = lines.findIndex(({ text }) => squash(text) === squash(until));
  const masthead = lines.slice(0, heading < 0 ? lines.length : heading);
  if (!masthead.length) return [];

  const edge = Math.min(...masthead.map(({ left }) => left));
  return masthead
    .filter(({ left }) => left > edge + tolerance)
    .map(({ left, text }) => ({ left, edge, text }));
}

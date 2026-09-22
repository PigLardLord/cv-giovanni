/**
 * How many printed lines each sentence of the CV takes, and which pages it takes them on (#230).
 *
 * The measure (`line-length.mjs`) asks how far a line runs; this asks how far a sentence runs. A neutral read of the
 * printed CV found bullets of 34 to 43 words set over three and four lines, which a recruiter skimming for six
 * seconds does not read, and page 2 opening on three bullets with no role or employer above them: the reader meets
 * evidence with nothing to attach it to. Both are visible only on the artefact, since the same profile wraps
 * differently in each layout, so they are measured here on the text layer rather than asserted on the source.
 */

import { bboxLines, withoutPeriod } from './line-length.mjs';
import { SEPARATOR_GLYPHS } from '../../domain/Separators.js';

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
 * Each sentence as it printed: where it starts, how many lines it is set over, and the pages it reaches.
 *
 * A sentence the text layer does not hold comes back `found: false` rather than silently passing a check: a bullet
 * that never printed takes no lines at all.
 * @param {string} text - The text layer, from `pdftotext`
 * @param {string[]} sentences - The sentences to look for, as the profile writes them
 * @param {{ periods?: string[] }} [options] - Each role's dates as they print, for Nerd Mode's date column
 * @returns {{ text: string, found: boolean, page: number|null, lines: number|null, pages: number[], last: string|null }[]}
 *   One a sentence, with the last line it is set over (#295)
 */
export function proseSpans(text, sentences, { periods = [] } = {}) {
  const lines = printedLines(text);
  const written = periods.map(squash);
  return sentences.map(squash).map((sentence) => {
    for (let at = 0; at < lines.length; at += 1) {
      for (const opening of withoutPeriod(lines[at].text, written)) {
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
            pages: [...new Set(over.map((line) => line.page))],
            last: over.at(-1).text
          };
        }
      }
    }
    return { text: sentence, found: false, page: null, lines: null, pages: [], last: null };
  });
}

/**
 * The sentences that end on a line of a single word, which the eye reads as a layout error before it reads the word
 * (the product review of #262, #295). A sentence set on one line has no last line of its own.
 * @param {{ text: string, found: boolean, lines: number|null, last: string|null }[]} spans - From `proseSpans`
 * @returns {{ bullet: string, last: string }[]} One a runt, with the word it strands
 */
export function runtSpans(spans) {
  return spans
    .filter((span) => span.found && span.lines > 1 && span.last.trim().split(/\s+/).length === 1)
    .map(({ text, last }) => ({ bullet: text, last }));
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
    // The header is one line, "Title at Company, City", or two: the title alone, and the employer's line under it,
    // opening on the employer (#240). Any two neighbouring lines would pass a sentence naming the title over one naming
    // the employer (the review of #367).
    const header =
      pages.find(({ lines }) =>
        lines.some(
          (line, at) =>
            (line.includes(role.title) && line.includes(role.company)) ||
            (squash(line) === squash(role.title) &&
              squash(lines[at + 1] ?? '').startsWith(squash(role.company)))
        )
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
 * The roles whose own sentences run onto a page after the one their header stands on, and the roles whose header
 * was not found at all.
 *
 * Page 2 of the printed CV opened on three bullets under no heading, and a reader who turns the page meets evidence
 * with nothing to attach it to: no employer, no title, no dates. The break belongs between two roles.
 *
 * A role whose header line the print does not hold is reported rather than passed over: a check that cannot find
 * what it measures has not measured it, and a run that did not happen must never read as a pass (AGENTS.md).
 * @param {string} text - The text layer, from `pdftotext`
 * @param {{ title: string, company: string, prose: string[] }[]} roles - Each role and what it says
 * @param {{ periods?: string[] }} [options] - Each role's dates as they print
 * @returns {{ title: string, company: string, header: number|null, pages: number[] }[]} The roles that straddle
 */
export function straddlingRoles(text, roles, options) {
  return rolePages(text, roles, options).filter(
    ({ header, pages }) => header === null || pages.some((page) => page !== header)
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

/**
 * The lines of the masthead that open or close on a separator.
 *
 * The contacts' separators are drawn by the stylesheet, in the place of a label it hides, so a field the profile
 * leaves out takes its value away and leaves the dot behind: a profile with no availability printed
 * "Bad Liebenstein, Thuringia, Germany ·". The rule against an entry ending on the separator of a part it does not
 * have (#178) reads the entries under their headings, and the masthead is not an entry, so it needs its own (#230).
 * @param {string} text - The text layer, from `pdftotext`
 * @param {{ until: string }} options - The first heading under the masthead
 * @returns {string[]} Every masthead line that starts or ends on a separator
 */
export function strandedSeparators(text, { until }) {
  const [page] = printedPages(text);
  if (!page) return [];
  const heading = page.lines.findIndex((line) => line === squash(until));
  return page.lines
    .slice(0, heading < 0 ? page.lines.length : heading)
    .filter((line) =>
      SEPARATOR_GLYPHS.some((glyph) => line.startsWith(glyph) || line.endsWith(glyph))
    );
}

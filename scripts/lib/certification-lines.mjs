/**
 * Whether each certification reached the text layer as the one line the layout draws.
 *
 * `adapters/PdfLayout.js` sets a certification as a single line, `name — issuer (year)`, and the page
 * budget has no room for a second: a copy edit that lengthens a name wraps it, spends the margin, and
 * extracts as two lines a parser reads as two entries. Nothing noticed until a variant ran to three
 * pages (#53).
 *
 * This module reads extracted text and nothing else, so the rule can be shown to fail on text that
 * breaks it.
 */

/** The line the layout draws for a certification, as `adapters/PdfLayout.js` writes it. */
export const certificationLine = ({ name, issuer, year }) => `${name} — ${issuer} (${year})`;

/** Horizontal whitespace as plain `pdftotext` hands it back: one space, never a no-break space. */
const normalised = (text) => text.replace(/[^\S\n]+/g, ' ').trim();

const occurrences = (text, part) => text.split(part).length - 1;

/**
 * @param {string} extracted - Plain `pdftotext` output, without `-layout`
 * @param {{ name: string, issuer: string, year: number|string }[]} [certifications] - As the profile
 *   writes them, in order
 * @returns {{ line: string, problem: 'missing'|'not on one line'|'out of order'|'repeated' }[]} What is
 *   wrong, entry by entry; empty when every entry is a line of its own, once, in the authored order
 */
export function certificationProblems(extracted, certifications = []) {
  const lines = extracted.split('\n').map(normalised);
  const collapsed = extracted.replace(/\s+/g, ' ');
  const expected = (certifications || []).map((item) => normalised(certificationLine(item)));
  const used = new Set();
  const problems = [];
  let previous = -1;

  // Each entry takes a line of its own, in order: one extracted line never stands for two entries.
  for (const line of expected) {
    const free = (index) => lines[index] === line && !used.has(index);
    const next = lines.findIndex((_, index) => index > previous && free(index));
    if (next >= 0) {
      used.add(next);
      previous = next;
      continue;
    }
    const earlier = lines.findIndex((_, index) => free(index));
    if (earlier >= 0) {
      used.add(earlier);
      problems.push({ line, problem: 'out of order' });
      continue;
    }
    const matched = [...used].filter((index) => lines[index] === line).length;
    const problem = occurrences(collapsed, line) > matched ? 'not on one line' : 'missing';
    problems.push({ line, problem });
  }

  for (const line of new Set(expected)) {
    const written = expected.filter((entry) => entry === line).length;
    if (lines.filter((entry) => entry === line).length > written) {
      problems.push({ line, problem: 'repeated' });
    }
  }
  return problems;
}

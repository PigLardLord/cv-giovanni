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

/**
 * @param {string} extracted - Plain `pdftotext` output, without `-layout`
 * @param {{ name: string, issuer: string, year: number|string }[]} [certifications] - As the profile
 *   writes them, in order
 * @returns {{ line: string, problem: 'missing'|'not on one line'|'out of order' }[]} What is wrong,
 *   entry by entry; empty when every entry is a line of its own, in the authored order
 */
export function certificationProblems(extracted, certifications = []) {
  const lines = extracted.split('\n').map((line) => line.trim());
  const collapsed = extracted.replace(/\s+/g, ' ');
  const problems = [];
  let previous = -1;

  for (const line of (certifications || []).map(certificationLine)) {
    const at = lines.indexOf(line);
    if (at < 0) {
      problems.push({ line, problem: collapsed.includes(line) ? 'not on one line' : 'missing' });
    } else if (at < previous) {
      problems.push({ line, problem: 'out of order' });
    } else {
      previous = at;
    }
  }
  return problems;
}

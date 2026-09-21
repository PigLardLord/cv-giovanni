/**
 * Whether the ATS fixtures are still the print they stand for (#234).
 *
 * `tests/fixtures/ats/page-print-<layout>.txt` is `pdftotext` of a layout's print, and `page-print-<layout>.raw.txt`
 * is `pdftotext -raw` of it. Tests read them as the current CV, so a content change that forgets to extract them again
 * leaves the suite asserting an older CV, and passing: Nerd Mode's had drifted two lines from its print on `main` when
 * #262 regenerated them. `audit:print` extracts both on every run; this compares them with the fixtures.
 */
export const FIXTURES = 'tests/fixtures/ats';

/**
 * A line as the comparison reads it: its words, one space apart, and none beside a "·". Where poppler infers a space
 * between glyphs differs by its version: CI's reads the links line of the raw print as "PigLardLord · linkedin" where
 * this machine's reads "PigLardLord·linkedin", from the same PDF (the first run of #297 on CI). That is the
 * extractor, not the print. The words and the lines they break into are the print, and are compared as they are.
 */
const comparable = (line) =>
  line
    .replace(/\s*·\s*/g, '·')
    .replace(/\s+/g, ' ')
    .trim();

/** The fixtures a layout's print stands behind, each with the extraction it is. */
export const fixturesOf = (layout) => [
  { name: `page-print-${layout}.txt`, reading: 'text' },
  { name: `page-print-${layout}.raw.txt`, reading: 'drawn' }
];

/**
 * @param {{ layout: string, text: string, drawn: string }} print - A layout's two extractions
 * @param {(name: string) => string | null} read - A fixture's text, or null when that layout has none
 * @returns {{ fixture: string, line: number, printed: string, fixed: string }[]} Each fixture that differs from the
 *   print, with the first line where they part
 */
export function staleFixtures({ layout, text, drawn }, read) {
  const extractions = { text, drawn };
  return fixturesOf(layout).flatMap(({ name, reading }) => {
    const fixed = read(name);
    if (fixed === null) return [];
    const printedLines = extractions[reading].split('\n');
    const fixedLines = fixed.split('\n');
    const same = (line, index) =>
      index < fixedLines.length && comparable(line) === comparable(fixedLines[index]);
    if (printedLines.length === fixedLines.length && printedLines.every(same)) return [];
    const at = printedLines.findIndex((line, index) => !same(line, index));
    const line = at < 0 ? printedLines.length : at;
    return [
      {
        fixture: `${FIXTURES}/${name}`,
        line: line + 1,
        printed: printedLines[line] ?? '(end)',
        fixed: fixedLines[line] ?? '(end)'
      }
    ];
  });
}

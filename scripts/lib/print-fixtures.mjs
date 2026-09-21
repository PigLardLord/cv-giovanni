/**
 * Whether the ATS fixtures are still the print they stand for (#234).
 *
 * `tests/fixtures/ats/page-print-<layout>.txt` is `pdftotext` of a layout's print, and `page-print-<layout>.raw.txt`
 * is `pdftotext -raw` of it. Tests read them as the current CV, so a content change that forgets to extract them again
 * leaves the suite asserting an older CV, and passing: Nerd Mode's had drifted two lines from its print on `main` when
 * #262 regenerated them. `audit:print` extracts both on every run; this compares them with the fixtures.
 */
export const FIXTURES = 'tests/fixtures/ats';

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
    if (fixed === null || fixed === extractions[reading]) return [];
    const printedLines = extractions[reading].split('\n');
    const fixedLines = fixed.split('\n');
    const at = printedLines.findIndex((line, index) => line !== fixedLines[index]);
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

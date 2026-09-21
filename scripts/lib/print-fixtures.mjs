/**
 * Whether the ATS fixtures are still the print they stand for (#234).
 *
 * `tests/fixtures/ats/page-print-<profile>-<locale>-<layout>.txt` is `pdftotext` of a published CV's print in one
 * layout, and `….raw.txt` is `pdftotext -raw` of it. The name says which CV it is the print of, so a second published
 * CV can carry fixtures of its own (#302). Tests read them as the current CV, so a content change that forgets to extract them again
 * leaves the suite asserting an older CV, and passing: Nerd Mode's had drifted two lines from its print on `main` when
 * #262 regenerated them. `audit:print` extracts both on every run; this compares them with the fixtures.
 */
export const FIXTURES = 'tests/fixtures/ats';

/**
 * A line as the comparison reads it: its characters, without the spaces between them. Where poppler infers a space
 * between glyphs differs by its version — CI's reads the links line of the raw print as "PigLardLord · linkedin" where
 * this machine's reads "PigLardLord·linkedin", from the same PDF (the first run of #297 on CI) — and the next version
 * may space another separator differently. That is the extractor, not the print. The words, and the lines they break
 * into, are the print: a changed word or a line broken elsewhere still differs.
 */
const comparable = (line) => line.replace(/\s+/g, '');

/**
 * A reading's lines, as the comparison counts them. Where poppler writes the page break differs by its version too:
 * this machine's joins the next page's first line to the break, "…new screens.\fMay 2015 – …", where CI's starts it on
 * a line of its own (the second run of #297 on CI). A break is a line's end, and a line that holds nothing is none.
 */
const linesOf = (reading) =>
  reading
    .split(/[\n\f]/)
    .map((line) => ({ line, compared: comparable(line) }))
    .filter(({ compared }) => compared !== '');

/**
 * The fixtures a CV's print in one layout stands behind, each with the extraction it is.
 * @param {{ profile: string, locale: string, layout: string }} print - Which CV, and which layout
 * @returns {{ name: string, reading: 'text'|'drawn' }[]} The fixtures' names, under `FIXTURES`
 */
export const fixturesOf = ({ profile, locale, layout }) => [
  { name: `page-print-${profile}-${locale}-${layout}.txt`, reading: 'text' },
  { name: `page-print-${profile}-${locale}-${layout}.raw.txt`, reading: 'drawn' }
];

/**
 * The fixtures a CV's print in one layout has, and the half of a pair it lacks: a `.txt` regenerated without its
 * `.raw.txt`, or the reverse, is the likely mistake of extracting by hand, and would pass unread (#321).
 * @param {{ profile: string, locale: string, layout: string }} print - Which CV, and which layout
 * @param {(name: string) => string | null} read - A fixture's text, or null when there is none
 * @returns {{ held: string[], missing: string[] }} The fixtures there are, and each one missing beside its other half
 */
export function fixturePair(print, read) {
  const names = fixturesOf(print).map(({ name }) => name);
  const held = names.filter((name) => read(name) !== null);
  return { held, missing: held.length ? names.filter((name) => !held.includes(name)) : [] };
}

/**
 * @param {{ profile: string, locale: string, layout: string, text: string, drawn: string }} print - A CV's print in one
 *   layout, and its two extractions
 * @param {(name: string) => string | null} read - A fixture's text, or null when that layout has none
 * @returns {{ fixture: string, line: number, printed: string, fixed: string }[]} Each fixture that differs from the
 *   print, with the first line where they part
 */
export function staleFixtures({ profile, locale, layout, text, drawn }, read) {
  const extractions = { text, drawn };
  return fixturesOf({ profile, locale, layout }).flatMap(({ name, reading }) => {
    const fixed = read(name);
    if (fixed === null) return [];
    const printedLines = linesOf(extractions[reading]);
    const fixedLines = linesOf(fixed);
    const same = ({ compared }, index) => compared === fixedLines[index]?.compared;
    if (printedLines.length === fixedLines.length && printedLines.every(same)) return [];
    const at = printedLines.findIndex((line, index) => !same(line, index));
    const line = at < 0 ? printedLines.length : at;
    return [
      {
        fixture: `${FIXTURES}/${name}`,
        line: line + 1,
        printed: printedLines[line]?.line ?? '(end)',
        fixed: fixedLines[line]?.line ?? '(end)'
      }
    ];
  });
}

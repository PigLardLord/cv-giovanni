/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applicability, productReviewPaths } from '../scripts/lib/base-parser.mjs';

// A change to both the CV and the ATS parser is graded by the parser it changed (#181). Pull request #179 first added
// " · 60 ECTS" after the Pisa school line and widened the parser to read it, and "Recoverability 80/80" held while the
// base branch's parser read the school as "Development". `npm run audit:ats:base` reads the new print with the base
// branch's parser. These are its rules, each shown able to fail.
const root = fileURLToPath(new URL('..', import.meta.url));
const agents = readFileSync(`${root}AGENTS.md`, 'utf8');

describe('what renders the CV, as the product review names it', () => {
  test("reads the paths AGENTS.md's product review names", () => {
    const paths = productReviewPaths(agents);

    expect(paths).toEqual(
      expect.arrayContaining([
        'profiles/',
        'locales/',
        'renderers/',
        'domain/EntryLines.js',
        'index.html',
        'style.css',
        'layouts.css',
        'print.css'
      ])
    );
    expect(paths.filter((path) => !existsSync(`${root}${path}`))).toEqual([]);
  });

  test('reads nothing when the section is not there, so the step can refuse rather than never apply', () => {
    expect(
      productReviewPaths('# MyCV\n\n### Something else\n\n`profiles/` and `print.css`.')
    ).toEqual([]);
  });

  test('reads the first paragraph only, where the list is', () => {
    const markdown = [
      '### When the product review runs',
      '',
      'Whenever the diff touches `profiles/`, `print.css` (the paper) and',
      '`renderers/`.',
      '',
      'A ticket touching only `scripts/` does not need it.'
    ].join('\n');

    expect(productReviewPaths(markdown)).toEqual(['profiles/', 'print.css', 'renderers/']);
  });
});

describe('whether the step applies', () => {
  const sets = {
    parser: ['core/AtsTextParser.js', 'domain/DateRange.js', 'domain/fold.js'],
    rendering: ['profiles/', 'locales/', 'renderers/', 'print.css', 'domain/DateRange.js']
  };

  test('a change to the parser and to what renders the CV applies, and says which files made it so', () => {
    const decision = applicability(
      ['core/AtsTextParser.js', 'profiles/general/en.json', 'tests/AtsTextParser.test.js'],
      sets
    );

    expect(decision.applies).toBe(true);
    expect(decision.parser).toEqual(['core/AtsTextParser.js']);
    expect(decision.rendering).toEqual(['profiles/general/en.json']);
    expect(decision.reason).toMatch(/core\/AtsTextParser\.js/);
    expect(decision.reason).toMatch(/profiles\/general\/en\.json/);
  });

  test('a change to the parser alone does not apply: the print it would read is the one it already reads', () => {
    const decision = applicability(['core/AtsTextParser.js', 'domain/fold.js'], sets);

    expect(decision.applies).toBe(false);
    expect(decision.reason).toMatch(/nothing that renders the CV/);
  });

  test('a change to what renders the CV alone does not apply: audit:ats already reads it with that parser', () => {
    const decision = applicability(['locales/en/cv.json', 'renderers/EducationRenderer.js'], sets);

    expect(decision.applies).toBe(false);
    expect(decision.reason).toMatch(/not the parser/);
  });

  test('a change to scripts, the workflow and the docs applies to neither', () => {
    const decision = applicability(
      ['scripts/audit-ats-base.mjs', '.github/workflows/gates.yml', 'AGENTS.md'],
      sets
    );

    expect(decision.applies).toBe(false);
    expect(decision.reason).toMatch(/neither/);
  });

  test('a module both read applies on its own', () => {
    expect(applicability(['domain/DateRange.js'], sets).applies).toBe(true);
  });

  test('a directory holds what is under it, and only that', () => {
    expect(applicability(['core/AtsTextParser.js', 'profiles-old/en.json'], sets).applies).toBe(
      false
    );
    expect(applicability(['core/AtsTextParser.js', 'print.css.bak'], sets).applies).toBe(false);
  });
});

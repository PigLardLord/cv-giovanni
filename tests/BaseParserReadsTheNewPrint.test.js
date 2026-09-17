/**
 * @jest-environment node
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { CvDocument } from '../domain/CvDocument.js';
import {
  applicability,
  fieldVerdicts,
  gradedReadings,
  GRADER,
  lossLine,
  lostFields,
  notGradedOnBase,
  outcome,
  PAGE_SCRIPT,
  PARSER,
  PRINT_PIPELINE,
  productReviewPaths,
  pullRequestLabels,
  readingLosses,
  readingsUnmatched,
  renderingModules,
  report,
  TRADE_LABEL,
  unmatchedSections
} from '../scripts/lib/base-parser.mjs';
import { importApart, importClosure } from '../scripts/lib/import-closure.mjs';
import { catalogueTranslator } from '../scripts/lib/printed-letter.mjs';

// A change to both the CV and the ATS parser is graded by the parser it changed (#181). Pull request #179 first added
// " · 60 ECTS" after the Pisa school line and widened the parser to read it, and "Recoverability 80/80" held while the
// base branch's parser read the school as "Development". `npm run audit:ats:base` reads the new print with the base
// branch's parser. These are its rules, each shown able to fail.
const root = fileURLToPath(new URL('..', import.meta.url));
const agents = readFileSync(`${root}AGENTS.md`, 'utf8');
const document = new CvDocument(
  JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'))
);
const catalogue = JSON.parse(readFileSync(`${root}locales/en/cv.json`, 'utf8'));
const wordsOf = (cv) => {
  const t = catalogueTranslator({ cv });
  return { locale: 'en', credits: (count) => t('cv:education.credits', { count }) };
};
const words = wordsOf(catalogue);
const read = (text) =>
  fieldVerdicts(RecoveryDiff.diff(document, AtsTextParser.parse(text), { words }));
// The print as it is, and as #179 first drew it: the scope after the school's period, not after the degree's name.
const print = readFileSync(`${root}tests/fixtures/ats/page-print-nerd.txt`, 'utf8');
const firstPlacement = print.replace(
  'Development (60 ECTS)\nUniversità degli Studi di Pisa (2014 – 2016)',
  'Development\nUniversità degli Studi di Pisa (2014 – 2016) · 60 ECTS'
);

describe('what renders the CV, as the product review names it', () => {
  test("reads the paths AGENTS.md's product review names", () => {
    const paths = productReviewPaths(agents);

    // The whole list, not a sample: a path the paragraph lost would shrink what the step watches without a word, and
    // a change to it and the parser would read as one that touches the parser alone (the code review of #203).
    expect(paths).toEqual([
      'profiles/',
      'locales/',
      'renderers/',
      'domain/EntryLines.js',
      'adapters/SwiftSourceLayout.js',
      'script.js',
      'core/I18nService.js',
      'core/DocumentLocalizer.js',
      'index.html',
      'style.css',
      'layouts.css',
      'design-glacier.css',
      'print.css',
      'scripts/generate-pdfs.mjs',
      'scripts/lib/printed-cv.mjs',
      'scripts/lib/print-page.mjs',
      'scripts/lib/page-ready.mjs',
      'vendor/fonts/',
      'core/CvFiles.js',
      'letter.html',
      'letter.css',
      'core/LetterContent.js',
      'renderers/LetterRenderer.js'
    ]);
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

describe('what renders the CV, read from the imports', () => {
  const files = {
    'script.js': [
      "import { I18nService } from './core/I18nService.js';",
      "import { HeaderRenderer } from './renderers/HeaderRenderer.js';"
    ].join('\n'),
    'core/I18nService.js': "import i18next from '../vendor/i18next/i18next.js';",
    'vendor/i18next/i18next.js': 'export default {};',
    'renderers/HeaderRenderer.js': "import { DateRange } from '../domain/DateRange.js';",
    'renderers/LetterRenderer.js': "import { CoverLetter } from '../domain/CoverLetter.js';",
    'domain/DateRange.js': "import { fold } from './fold.js';",
    'domain/fold.js': 'export const fold = (x) => x;',
    'domain/CoverLetter.js': 'export class CoverLetter {}',
    'scripts/generate-pdfs.mjs': "import { printLayouts } from './lib/printed-cv.mjs';",
    'scripts/lib/printed-cv.mjs': [
      "import { printPage } from './print-page.mjs';",
      "import { LetterContent } from '../../core/LetterContent.js';"
    ].join('\n'),
    'scripts/lib/print-page.mjs': 'export const printPage = () => {};',
    'core/LetterContent.js': [
      "import { DateRange } from '../domain/DateRange.js';",
      "import { PlaceLexicon } from '../domain/PlaceLexicon.js';"
    ].join('\n'),
    'domain/PlaceLexicon.js': "import { fold } from './fold.js';",
    'core/AtsTextParser.js': [
      "import { DateRange } from '../domain/DateRange.js';",
      "import { PlaceLexicon } from '../domain/PlaceLexicon.js';"
    ].join('\n')
  };
  const read = (path) => files[path] ?? null;
  const renderers = ['renderers/HeaderRenderer.js', 'renderers/LetterRenderer.js'];
  const parser = importClosure([PARSER], read);

  test("the page's entry script and every module it imports: it decides what the page renders, in which labels", () => {
    expect(PAGE_SCRIPT).toBe('script.js');
    expect(renderingModules(renderers, read, parser)).toEqual(
      expect.arrayContaining([
        'script.js',
        'core/I18nService.js',
        'vendor/i18next/i18next.js',
        'renderers/HeaderRenderer.js',
        'domain/DateRange.js',
        'domain/fold.js'
      ])
    );
  });

  test('every renderer too, one the entry script never imports included: it renders a page of its own', () => {
    expect(renderingModules(renderers, read, parser)).toEqual(
      expect.arrayContaining(['renderers/LetterRenderer.js', 'domain/CoverLetter.js'])
    );
  });

  test('the print pipeline and every module it imports: the PDF is the page Chrome prints through it', () => {
    expect(PRINT_PIPELINE).toBe('scripts/generate-pdfs.mjs');
    expect(renderingModules(renderers, read, parser)).toEqual(
      expect.arrayContaining([
        'scripts/generate-pdfs.mjs',
        'scripts/lib/printed-cv.mjs',
        'scripts/lib/print-page.mjs',
        'core/LetterContent.js'
      ])
    );
  });

  test("a parser module the pipeline reaches and the page does not is the parser's alone", () => {
    const modules = renderingModules(renderers, read, parser);

    expect(parser).toContain('domain/PlaceLexicon.js');
    expect(modules).not.toContain('domain/PlaceLexicon.js');
    // The page writes its dates through these, so a change to one changes the print and the grader at once.
    expect(modules).toEqual(expect.arrayContaining(['domain/DateRange.js', 'domain/fold.js']));
    expect(applicability(['domain/PlaceLexicon.js'], { parser, rendering: modules }).applies).toBe(
      false
    );
    // Read without the parser, the pipeline counts the lexicon as rendering, and a change to it alone would apply.
    expect(renderingModules(renderers, read, [])).toContain('domain/PlaceLexicon.js');
  });

  test('a pipeline that imported the parser itself would not make a change to the parser alone apply', () => {
    const grading = {
      ...files,
      'scripts/lib/printed-cv.mjs': [
        files['scripts/lib/printed-cv.mjs'],
        "import { AtsTextParser } from '../../core/AtsTextParser.js';"
      ].join('\n')
    };
    const readGrading = (path) => grading[path] ?? null;
    const modules = renderingModules(renderers, readGrading, parser);

    expect(importClosure([PRINT_PIPELINE], readGrading)).toContain(PARSER);
    expect(modules).not.toContain(PARSER);
    expect(applicability([PARSER], { parser, rendering: modules }).applies).toBe(false);
  });
});

describe('what renders the CV in this repository', () => {
  const fromDisk = (path) =>
    existsSync(`${root}${path}`) ? readFileSync(`${root}${path}`, 'utf8') : null;
  const renderers = readdirSync(`${root}renderers`)
    .filter((name) => /\.m?js$/.test(name))
    .map((name) => `renderers/${name}`);
  const parser = importClosure([PARSER], fromDisk);
  const modules = renderingModules(renderers, fromDisk, parser);
  const sets = {
    parser,
    rendering: [...new Set([...productReviewPaths(agents), ...modules])].sort()
  };

  // The page's entry script registers the renderers, and the two services beside it supply every label the page
  // prints: a change to one of them and to the parser went unread by the base's parser (#202).
  test.each(['script.js', 'core/I18nService.js', 'core/DocumentLocalizer.js'])(
    "%s renders the CV, read from the entry script's imports",
    (path) => {
      expect(modules).toContain(path);
      expect(applicability([path, PARSER], sets)).toEqual(
        expect.objectContaining({ applies: true, parser: [PARSER], rendering: [path] })
      );
      expect(applicability([path], sets).applies).toBe(false);
    }
  );

  // The PDF is the page, printed by Chrome through these (#144, #149): when it is ready, and with which fonts.
  test.each([
    'scripts/generate-pdfs.mjs',
    'scripts/lib/printed-cv.mjs',
    'scripts/lib/print-page.mjs',
    'scripts/lib/page-ready.mjs'
  ])("%s renders the CV, read from the print pipeline's imports", (path) => {
    expect(modules).toContain(path);
    expect(applicability([path, PARSER], sets).applies).toBe(true);
    expect(applicability([path], sets).applies).toBe(false);
  });

  test("a change to print-page.mjs and the parser is read by the base branch's parser; print-page.mjs alone is not", () => {
    const both = applicability(['scripts/lib/print-page.mjs', 'core/AtsTextParser.js'], sets);

    expect(both).toEqual(
      expect.objectContaining({
        applies: true,
        parser: ['core/AtsTextParser.js'],
        rendering: ['scripts/lib/print-page.mjs']
      })
    );
    expect(applicability(['scripts/lib/print-page.mjs'], sets)).toEqual(
      expect.objectContaining({ applies: false, rendering: ['scripts/lib/print-page.mjs'] })
    );
    expect(applicability(['scripts/lib/print-page.mjs'], sets).reason).toMatch(/not the parser/);
  });

  test('the only parser modules that render the CV are the ones the page writes its dates through', () => {
    // The pipeline reaches the parser's place lexicon through the cover letter: counted, every change to it would read
    // as one to the parser and to the print, and the step would run on a change to the parser alone.
    expect(importClosure([PRINT_PIPELINE], fromDisk)).toContain('domain/PlaceLexicon.js');
    expect(parser.filter((path) => applicability([path], sets).applies)).toEqual([
      'domain/DateRange.js',
      'domain/fold.js'
    ]);
    expect(applicability([PARSER], sets).reason).toMatch(/nothing that renders the CV/);
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

describe("what the base branch's parser recovered, field by field", () => {
  test("grades every field the audit grades, the degree's period and the structure beside them", () => {
    const fields = read(print);
    const keys = fields.map((field) => field.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        'segmentation',
        'identity.email',
        'experience.0.title',
        'experience.0.together',
        'chronology',
        'education.0.degree',
        'education.0.school',
        'education.0.period',
        'education.0.together',
        'skills.0.category',
        'skills.0.attached',
        'spokenLanguages.0.level',
        'certifications.0.name',
        'unexpected.roles',
        'unexpected.skillCategories'
      ])
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      fields.filter((field) => !['exact', 'normalised', 'held'].includes(field.verdict))
    ).toEqual([]);
    expect(fields.find((field) => field.key === 'education.0.period')).toEqual(
      expect.objectContaining({
        label: 'education 1, period',
        verdict: 'exact',
        written: '2014 – 2016',
        recovered: '2014 – 2016'
      })
    );
  });

  test('a degree that writes no period has no period to lose', () => {
    const undated = new CvDocument({ education: [{ degree: 'B.Sc.', school: 'Somewhere' }] });
    const recovered = AtsTextParser.parse('Education\nB.Sc.\nSomewhere');
    const keys = fieldVerdicts(RecoveryDiff.diff(undated, recovered)).map((field) => field.key);

    expect(keys).not.toContain('education.0.period');
  });

  // The step graded the degree's period itself while the audit's diff did not (#181). The diff grades it now (#200),
  // and the step reads its verdict and its evidence, so the two can never grade the same period differently.
  test("reads the degree's period from the audit's diff, verdict and evidence", () => {
    const diff = RecoveryDiff.diff(document, AtsTextParser.parse(print), { words });
    diff.education[0].period = 'wrong';
    diff.evidence['education.0.period'] = { written: '2014 – 2016', recovered: '2016' };

    expect(fieldVerdicts(diff).find((field) => field.key === 'education.0.period')).toEqual({
      key: 'education.0.period',
      label: 'education 1, period',
      verdict: 'wrong',
      written: '2014 – 2016',
      recovered: '2016'
    });
  });
});

describe("a field the base branch's parser loses from the new print", () => {
  test("#179's first placement loses the Pisa school and its period, and says what came back", () => {
    const lines = lostFields(read(print), read(firstPlacement)).map(lossLine);

    expect(lines).toEqual(
      expect.arrayContaining([
        'education 1, school: "Università degli Studi di Pisa" → "Development" (exact → wrong)',
        'education 1, period: "2014 – 2016" → nothing (exact → lost)'
      ])
    );
    expect(lines.filter((line) => /^education 2/.test(line))).toEqual([]);
  });

  test('the print as it is loses nothing', () => {
    expect(lostFields(read(print), read(print))).toEqual([]);
  });

  // The diff matched an entry to the document's by its position, so a degree the base's parser drops from the new print
  // compared the next degree with it, and the losses named both, quoting the Catania degree as the Pisa one's reading
  // (#217). Matched by what it says, the degree lost is the one named.
  test("a degree the base's parser drops from the new print is the one named, and the degree after it is not", () => {
    const dropped = print.replace(
      "First Level Professional Master's Programme in Mobile Applications\nDevelopment (60 ECTS)\nUniversità degli Studi di Pisa (2014 – 2016)\n\n",
      ''
    );
    const lines = lostFields(read(print), read(dropped)).map(lossLine);

    expect(dropped).not.toBe(print);
    expect(lines).toEqual([
      'education 1, degree: "First Level Professional Master\'s Programme in Mobile Applications Development (60 ECTS)" → nothing (exact → lost)',
      'education 1, school: "Università degli Studi di Pisa" → nothing (exact → lost)',
      'education 1, period: "2014 – 2016" → nothing (exact → lost)',
      'education 1, degree beside its school: held → broken'
    ]);
  });

  test('a role or a skill category the document never wrote is a loss too: the score charges for both', () => {
    const torn = print.replace(
      'Core Technologies\n',
      'Core Technologies\nInvented Category — Foo, Bar\n'
    );
    const lines = lostFields(read(print), read(torn)).map(lossLine);

    expect(torn).not.toBe(print);
    expect(lines).toContain('skill categories the document did not write: held → broken');
  });

  const field = (key, verdict, values = {}) => ({
    key,
    label: key,
    verdict,
    written: null,
    recovered: null,
    ...values
  });

  test.each([
    ['exact', 'partial', true],
    ['partial', 'wrong', true],
    ['wrong', 'lost', true],
    ['held', 'broken', true],
    ['exact', 'normalised', false],
    ['normalised', 'exact', false],
    ['partial', 'partial', false],
    ['lost', 'exact', false],
    ['broken', 'held', false]
  ])('%s on the base print and %s on the new one is a loss: %s', (from, to, lost) => {
    expect(lostFields([field('f', from)], [field('f', to)]).length).toBe(lost ? 1 : 0);
  });

  test('a field only one print has is not compared: an entry the change removed is not a loss', () => {
    expect(lostFields([field('education.2.school', 'exact')], [])).toEqual([]);
    expect(lostFields([], [field('education.2.school', 'lost')])).toEqual([]);
  });

  test('a loss with nothing to quote is named by its verdicts, and a loss with a list by what did not come back', () => {
    expect(
      lossLine({ label: 'education 1, degree beside its school', from: 'held', to: 'broken' })
    ).toBe('education 1, degree beside its school: held → broken');
    expect(
      lossLine({
        label: 'experience 2, highlights',
        from: 'exact',
        to: 'partial',
        was: null,
        now: null,
        written: ['Led the migration.']
      })
    ).toBe('experience 2, highlights: exact → partial — written "Led the migration."');
  });

  // Each print is graded against its own branch's lines (#201), so what was lost can be the same text read back
  // against other words: the line says which, when the two branches wrote the field differently.
  test('a loss graded against words this print writes differently says what this print writes', () => {
    const pisa = {
      written: 'Università degli Studi di Pisa',
      recovered: 'Università degli Studi di Pisa'
    };
    const [loss] = lostFields(
      [
        field('education.0.school', 'exact', pisa),
        field('education.0.period', 'exact', { written: '2014 – 2016', recovered: '2014 – 2016' })
      ],
      [
        field('education.0.school', 'exact', pisa),
        field('education.0.period', 'partial', {
          written: '· 2014 – 2016',
          recovered: '2014 – 2016'
        })
      ]
    );

    expect(lossLine(loss)).toBe(
      'education.0.period: "2014 – 2016" → "2014 – 2016" (exact → partial) — this print writes "· 2014 – 2016"'
    );
    expect(
      lossLine(
        lostFields(
          [field('f', 'exact', { written: 'Pisa', recovered: 'Pisa' })],
          [field('f', 'wrong', { written: 'Pisa', recovered: 'Development' })]
        )[0]
      )
    ).toBe('f: "Pisa" → "Development" (exact → wrong)');
  });
});

// The step graded both prints with this branch's diff, which builds every expected line with this branch's
// `EntryLines` and in this branch's catalogue's words (#201). A change that rewords a line held the base's print to the
// new words: the base's print graded partial where it was exact, and a real loss on the new print read
// "partial → partial". Each print is graded against its own branch's lines now.
describe("each print, graded against its own branch's lines", () => {
  const fromDisk = (path) =>
    existsSync(`${root}${path}`) ? readFileSync(`${root}${path}`, 'utf8') : null;
  const side = (overrides = {}) => ({
    parser: AtsTextParser,
    grader: RecoveryDiff,
    document,
    words,
    ...overrides
  });
  const verdictOf = (fields, key) => fields.find((field) => field.key === key)?.verdict;

  // Branches whose grader was changed, imported apart from this checkout's as the step imports the base's.
  let scratch;
  let graders;
  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'base-grader-'));
    const edited = (file, from, to) => (path) => {
      if (path !== file) return fromDisk(path);
      const source = fromDisk(path);
      if (!source.includes(from)) throw new Error(`${file} no longer holds ${from}`);
      return source.replace(from, to);
    };
    const [dotted] = await importApart(
      ['core/RecoveryDiff.js'],
      edited('domain/EntryLines.js', '`(${when})`', '`· ${when}`'),
      join(scratch, 'dotted')
    );
    const [undated] = await importApart(
      ['core/RecoveryDiff.js'],
      edited('core/RecoveryDiff.js', 'const period = printedPeriod(item);', 'const period = null;'),
      join(scratch, 'undated')
    );
    graders = { dotted: dotted.RecoveryDiff, undated: undated.RecoveryDiff };
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test('the grader is the diff, the lines it builds each expectation with, and the document they are read from', () => {
    expect(GRADER).toEqual(['core/RecoveryDiff.js', 'domain/CvDocument.js']);
    expect(importClosure(GRADER, fromDisk)).toEqual(
      expect.arrayContaining([
        'core/RecoveryDiff.js',
        'domain/EntryLines.js',
        'domain/CvDocument.js'
      ])
    );
  });

  test("the base's parser reads both prints, and each print is graded by the branch that printed it", () => {
    const calls = [];
    const parser = (name) => ({ parse: (text) => ({ parser: name, text }) });
    const grader = (name) => ({
      diff: (graded, recovered, options) => {
        calls.push({ grader: name, document: graded, words: options.words, ...recovered });
        return { segmentation: 'ok' };
      }
    });

    const readings = gradedReadings(
      { base: 'the base print', head: 'this print' },
      {
        base: { parser: parser('base'), grader: grader('base'), document: 'base', words: 'base' },
        head: { parser: parser('head'), grader: grader('head'), document: 'head', words: 'head' }
      }
    );

    expect(calls).toEqual([
      { grader: 'base', document: 'base', words: 'base', parser: 'base', text: 'the base print' },
      { grader: 'head', document: 'head', words: 'head', parser: 'base', text: 'this print' },
      { grader: 'head', document: 'head', words: 'head', parser: 'head', text: 'this print' }
    ]);
    expect(Object.keys(readings)).toEqual(['baseOnBase', 'baseOnHead', 'headOnHead']);
    expect(readings.baseOnBase[0]).toEqual(
      expect.objectContaining({ key: 'segmentation', verdict: 'held' })
    );
  });

  // A branch that takes the scope out of the degree's line, its catalogue no longer writing it there, and prints it on a
  // line of its own: the base's parser reads that line into the degree.
  const scopeApart = print.replace(
    'Development (60 ECTS)\nUniversità degli Studi di Pisa',
    'Development\n60 ECTS\nUniversità degli Studi di Pisa'
  );
  const noScope = wordsOf({ ...catalogue, education: { ...catalogue.education, credits: '' } });

  test("a degree this branch rewords, which the base's parser misreads on this print, is a loss", () => {
    const readings = gradedReadings(
      { base: print, head: scopeApart },
      { base: side(), head: side({ words: noScope }) }
    );

    expect(scopeApart).not.toBe(print);
    expect(lostFields(readings.baseOnBase, readings.baseOnHead).map(lossLine)).toEqual([
      'education 1, degree: "First Level Professional Master\'s Programme in Mobile Applications Development (60 ECTS)" → "First Level Professional Master\'s Programme in Mobile Applications Development 60 ECTS" (exact → partial) — this print writes "First Level Professional Master\'s Programme in Mobile Applications Development"'
    ]);
  });

  test("graded by this branch's words, the base's print was partial, and the same loss read partial → partial", () => {
    const head = side({ words: noScope });
    const readings = gradedReadings({ base: print, head: scopeApart }, { base: head, head });

    expect(verdictOf(readings.baseOnBase, 'education.0.degree')).toBe('partial');
    expect(verdictOf(readings.baseOnHead, 'education.0.degree')).toBe('partial');
    expect(lostFields(readings.baseOnBase, readings.baseOnHead)).toEqual([]);
  });

  test("a period this branch's school line writes otherwise is graded in those words on this print only", () => {
    const dotted = print
      .replace(
        'Università degli Studi di Pisa (2014 – 2016)',
        'Università degli Studi di Pisa · 2014 – 2016'
      )
      .replace(
        'Università degli Studi di Catania (2009)',
        'Università degli Studi di Catania · 2009'
      );
    const readings = gradedReadings(
      { base: print, head: dotted },
      { base: side(), head: side({ grader: graders.dotted }) }
    );
    const headOnly = gradedReadings(
      { base: print, head: dotted },
      { base: side({ grader: graders.dotted }), head: side({ grader: graders.dotted }) }
    );

    expect(verdictOf(readings.baseOnBase, 'education.0.period')).toBe('exact');
    expect(verdictOf(readings.baseOnHead, 'education.0.period')).toBe('partial');
    expect(lostFields(readings.baseOnBase, readings.baseOnHead).map((loss) => loss.label)).toEqual([
      'education 1, period',
      'education 2, period'
    ]);
    expect(verdictOf(headOnly.baseOnBase, 'education.0.period')).toBe('partial');
    expect(lostFields(headOnly.baseOnBase, headOnly.baseOnHead)).toEqual([]);
  });

  // A base from before #200 grades no degree's period. Its print has no period verdict to compare, so a period the new
  // print loses cannot be a loss: it is named as not graded on the base.
  test("a field the base's grader does not grade is not graded on the base, and is not a loss", () => {
    const readings = [
      {
        artefact: 'nerd',
        order: 'default',
        ...gradedReadings(
          { base: print, head: firstPlacement },
          { base: side({ grader: graders.undated }), head: side() }
        )
      }
    ];

    expect(verdictOf(readings[0].baseOnBase, 'education.0.period')).toBeUndefined();
    expect(verdictOf(readings[0].baseOnHead, 'education.0.period')).toBe('lost');
    expect(readingLosses(readings).map((loss) => loss.key)).not.toContain('education.0.period');
    expect(readingLosses(readings).map((loss) => loss.key)).toContain('education.0.school');
    expect(notGradedOnBase(readings)).toEqual([
      {
        artefact: 'nerd',
        order: 'default',
        key: 'education.0.period',
        label: 'education 1, period'
      },
      {
        artefact: 'nerd',
        order: 'default',
        key: 'education.1.period',
        label: 'education 2, period'
      }
    ]);
  });

  test('a field both prints were graded on is not listed as not graded on the base', () => {
    const readings = [
      {
        artefact: 'nerd',
        order: 'default',
        ...gradedReadings({ base: print, head: print }, { base: side(), head: side() })
      }
    ];

    expect(notGradedOnBase(readings)).toEqual([]);
  });
});

/** Degrees a synthetic reading holds, each as the diff's evidence quotes what it writes. */
const DEGREES = {
  PhD: {
    degree: 'PhD in Computer Science',
    school: 'Università di Bologna',
    period: '2017 – 2020'
  },
  Master: {
    degree:
      "First Level Professional Master's Programme in Mobile Applications Development (60 ECTS)",
    school: 'Università degli Studi di Pisa',
    period: '2014 – 2016'
  },
  Bachelor: {
    degree: 'B.Sc. Computer Engineering',
    school: 'Università degli Studi di Catania',
    period: '2009'
  }
};
/** What a synthetic reading recovered of a written value, by the verdict it was given. */
const recoveredAs = (written, verdict) =>
  written === null
    ? null
    : ({ exact: written, partial: written.split(' ').slice(0, 2).join(' '), wrong: 'Development' }[
        verdict
      ] ?? null);
/**
 * One degree's fields at a position in its own branch's profile, as `fieldVerdicts` lists them, every one read in full
 * unless named.
 */
const degreeFields = (index, name, short = {}, writes = {}) =>
  [
    ['degree', 'exact'],
    ['school', 'exact'],
    ['period', 'exact'],
    ['together', 'held']
  ].map(([field, verdict]) => {
    const written = field === 'together' ? null : (writes[field] ?? DEGREES[name][field]);
    return {
      key: `education.${index}.${field}`,
      label: `education ${index + 1}, ${field === 'together' ? 'degree beside its school' : field}`,
      verdict: short[field] ?? verdict,
      written,
      recovered: recoveredAs(written, short[field] ?? verdict)
    };
  });

// Each print's diff keys an entry by its position in its own branch's profile, and the step compared the base's first
// degree with this branch's first degree (#221). A branch that reorders a section compared two different entries: the
// base's [A exact, B partial] against this branch's [B exact, A partial] matched exact with exact and partial with
// partial, and A going from exact to partial passed unsaid. So each entry of the base's profile is compared with the
// entry of this branch's that says the same, told by what identifies an entry as the diff tells it (#217), and a loss
// is named by its place in this branch's profile, and by its place in the base's when the two differ.
describe("the base's entries, lined up with this branch's by what they say", () => {
  const whole = [
    { key: 'segmentation', label: 'segmentation', verdict: 'held', written: null, recovered: null }
  ];
  const reading = (baseOnBase, baseOnHead) => ({
    artefact: 'nerd',
    order: 'default',
    baseOnBase,
    baseOnHead,
    headOnHead: baseOnHead
  });

  test('a reorder that hides a loss by position fails, naming the degree that lost it', () => {
    const before = [
      ...whole,
      ...degreeFields(0, 'Master'),
      ...degreeFields(1, 'Bachelor', { degree: 'partial' })
    ];
    const after = [
      ...whole,
      ...degreeFields(0, 'Bachelor'),
      ...degreeFields(1, 'Master', { degree: 'partial' })
    ];
    const readings = [reading(before, after)];

    expect(lostFields(before, after).map(lossLine)).toEqual([
      'education 2, degree (education 1 in the base\'s profile): "First Level Professional Master\'s Programme in Mobile Applications Development (60 ECTS)" → "First Level" (exact → partial)'
    ]);
    expect(outcome(readingLosses(readings), [], readingsUnmatched(readings)).exitCode).toBe(1);
  });

  test('a pure reorder that reads nothing short loses nothing, and passes', () => {
    const before = [...whole, ...degreeFields(0, 'Master'), ...degreeFields(1, 'Bachelor')];
    const after = [...whole, ...degreeFields(0, 'Bachelor'), ...degreeFields(1, 'Master')];
    const readings = [reading(before, after)];

    expect(readingLosses(readings)).toEqual([]);
    expect(notGradedOnBase(readings)).toEqual([]);
    expect(outcome(readingLosses(readings), [], readingsUnmatched(readings)).exitCode).toBe(0);
  });

  test("an entry in its place is named as before, with no place in the base's profile beside it", () => {
    const before = [...whole, ...degreeFields(0, 'Master'), ...degreeFields(1, 'Bachelor')];
    const after = [
      ...whole,
      ...degreeFields(0, 'Master'),
      ...degreeFields(1, 'Bachelor', { school: 'wrong' })
    ];

    expect(lostFields(before, after).map(lossLine)).toEqual([
      'education 2, school: "Università degli Studi di Catania" → "Development" (exact → wrong)'
    ]);
  });

  // A branch that rewrites a degree's line still writes its school: the pair is told by what the two still say alike.
  test('a degree this branch writes otherwise, and moves, is still told by its school', () => {
    const scopeless = {
      degree: "First Level Professional Master's Programme in Mobile Applications Development"
    };
    const before = [
      ...whole,
      ...degreeFields(0, 'Master', { period: 'partial' }),
      ...degreeFields(1, 'Bachelor')
    ];
    const after = [
      ...whole,
      ...degreeFields(0, 'Bachelor'),
      ...degreeFields(1, 'Master', { school: 'partial' }, scopeless)
    ];

    expect(lostFields(before, after).map((loss) => [loss.label, loss.moved])).toEqual([
      ['education 2, school', 'education 1']
    ]);
  });

  // The ticket's case on the print itself: the Pisa degree printed after Catania's, and its scope after its school, as
  // #179 first placed it. By position, the base's Pisa degree was compared with this branch's Catania degree.
  test("on the print, a degree moved and misread by the base's parser is the one named", () => {
    const profile = JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'));
    const [pisa, catania] = profile.education;
    const reordered = new CvDocument({ ...profile, education: [catania, pisa] });
    const pisaBlock =
      "First Level Professional Master's Programme in Mobile Applications\nDevelopment\nUniversità degli Studi di Pisa (2014 – 2016) · 60 ECTS";
    const cataniaBlock = 'B.Sc. Computer Engineering\nUniversità degli Studi di Catania (2009)';
    const movedPrint = firstPlacement.replace(
      `${pisaBlock}\n\n${cataniaBlock}`,
      `${cataniaBlock}\n\n${pisaBlock}`
    );
    const side = (graded) => ({
      parser: AtsTextParser,
      grader: RecoveryDiff,
      document: graded,
      words
    });
    const readings = gradedReadings(
      { base: print, head: movedPrint },
      { base: side(document), head: side(reordered) }
    );

    expect(movedPrint).not.toBe(firstPlacement);
    expect(lostFields(readings.baseOnBase, readings.baseOnHead).map(lossLine)).toEqual([
      'education 2, degree (education 1 in the base\'s profile): "First Level Professional Master\'s Programme in Mobile Applications Development (60 ECTS)" → "First Level Professional Master\'s Programme in Mobile Applications" (exact → partial)',
      'education 2, school (education 1 in the base\'s profile): "Università degli Studi di Pisa" → "Development" (exact → wrong)',
      'education 2, period (education 1 in the base\'s profile): "2014 – 2016" → nothing (exact → lost)'
    ]);
  });

  test('a pure reorder of degrees, certifications and languages on the print loses nothing', () => {
    const profile = JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'));
    const reordered = new CvDocument({
      ...profile,
      education: [...profile.education].reverse(),
      certifications: [...profile.certifications].reverse(),
      languages: [...profile.languages].reverse()
    });
    const swap = (text, first, second) => text.replace(`${first}${second}`, `${second}${first}`);
    const movedPrint = [
      [
        "First Level Professional Master's Programme in Mobile Applications\nDevelopment (60 ECTS)\nUniversità degli Studi di Pisa (2014 – 2016)\n\n",
        'B.Sc. Computer Engineering\nUniversità degli Studi di Catania (2009)\n\n'
      ],
      [
        'Android Enterprise Expert (incl. Associate, Professional) – Google (2026)\n',
        'iOS Lead Essentials (TDD, Clean Architecture) – Essential Developer (2024)\n'
      ],
      [
        'Italian: Native\nEnglish: C1 — professional working proficiency\n',
        'German: A1 — currently studying\n'
      ]
    ].reduce((text, [first, second]) => swap(text, first, second), print);
    const side = (graded) => ({
      parser: AtsTextParser,
      grader: RecoveryDiff,
      document: graded,
      words
    });
    const readings = gradedReadings(
      { base: print, head: movedPrint },
      { base: side(document), head: side(reordered) }
    );

    expect(movedPrint).not.toBe(print);
    expect(lostFields(readings.baseOnBase, readings.baseOnHead)).toEqual([]);
  });
});

// The step compares a field with the one at the same key on the base's print, and a key names an entry by its position
// in its own branch's profile (the code review of #216). When the two profiles hold a different number of entries in a
// section, the same position names two different entries: a degree added in front moved the others down, and the
// base's parser failing the last one read as an entry the base never had, not graded, "none is a loss". Each print's
// diff matches what came back to what its profile wrote by what it says (#217), which does not change what a position
// names across the two profiles. So a section numbered differently is still not compared by position. The base's parser
// reading all of it in full from the new print is still proof that nothing in it was lost; reading any of it short, it
// cannot tell a lost entry from a moved one, and the step exits 2.
describe('a section the two prints number differently', () => {
  const whole = [
    { key: 'segmentation', label: 'segmentation', verdict: 'held', written: null, recovered: null }
  ];
  const reading = (baseOnBase, baseOnHead) => ({
    artefact: 'nerd',
    order: 'default',
    baseOnBase,
    baseOnHead,
    headOnHead: baseOnHead
  });

  test("adding a degree: one the base's parser reads short at a position the base's print lacks is not compared, and exits 2", () => {
    // [Bachelor, Master] on the base; [PhD, Bachelor, Master] on this print, whose Master the base's parser fails.
    const before = [...whole, ...degreeFields(0, 'Bachelor'), ...degreeFields(1, 'Master')];
    const after = [
      ...whole,
      ...degreeFields(0, 'PhD'),
      ...degreeFields(1, 'Bachelor'),
      ...degreeFields(2, 'Master', { degree: 'lost' })
    ];
    const readings = [reading(before, after)];

    expect(lostFields(before, after)).toEqual([]);
    expect(notGradedOnBase(readings)).toEqual([]);
    expect(unmatchedSections(before, after)).toEqual([
      {
        section: 'education',
        base: 2,
        head: 3,
        short: [{ key: 'education.2.degree', label: 'education 3, degree', verdict: 'lost' }]
      }
    ]);
    expect(outcome(readingLosses(readings), [], readingsUnmatched(readings))).toEqual({
      exitCode: 2,
      accepted: false
    });
    // A label accepts a loss someone could read, not a comparison that did not happen.
    expect(
      outcome(readingLosses(readings), [TRADE_LABEL], readingsUnmatched(readings)).exitCode
    ).toBe(2);
  });

  test("adding a degree in front, as a print does it, and the base's parser losing an existing one, exits 2", () => {
    const phd = {
      degree: 'PhD in Computer Science',
      school: 'Università di Bologna',
      period: '2017 – 2020'
    };
    const profile = JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'));
    const added = new CvDocument({ ...profile, education: [phd, ...profile.education] });
    const addedPrint = print
      .replace(
        'Education\nFirst Level',
        'Education\nPhD in Computer Science\nUniversità di Bologna (2017 – 2020)\n\nFirst Level'
      )
      .replace(
        'Università degli Studi di Catania (2009)',
        'Università degli Studi di Catania – 2009'
      );
    const side = (graded) => ({
      parser: AtsTextParser,
      grader: RecoveryDiff,
      document: graded,
      words
    });
    const readings = [
      {
        artefact: 'nerd',
        order: 'default',
        ...gradedReadings(
          { base: print, head: addedPrint },
          { base: side(document), head: side(added) }
        )
      }
    ];

    expect(readingLosses(readings)).toEqual([]);
    expect(notGradedOnBase(readings)).toEqual([]);
    expect(readingsUnmatched(readings)).toEqual([
      expect.objectContaining({
        section: 'education',
        base: 2,
        head: 3,
        short: [
          { key: 'education.2.school', label: 'education 3, school', verdict: 'partial' },
          { key: 'education.2.period', label: 'education 3, period', verdict: 'lost' }
        ]
      })
    ]);
    expect(outcome([], [], readingsUnmatched(readings)).exitCode).toBe(2);

    // Each print's diff matched every degree that came back to its own (#217); the keys still count each profile's
    // degrees, so the first key names the Pisa degree on the base's print and the PhD on this one.
    const written = (fields, key) => fields.find((each) => each.key === key)?.written;
    const [reading] = readings;
    expect(written(reading.baseOnBase, 'education.0.school')).toBe(
      'Università degli Studi di Pisa'
    );
    expect(written(reading.baseOnHead, 'education.0.school')).toBe(phd.school);
    expect(written(reading.baseOnHead, 'education.1.school')).toBe(
      'Università degli Studi di Pisa'
    );
  });

  test('removing a degree: a loss that read partial → partial at a position both prints have exits 2', () => {
    // [PhD, Bachelor, Master] on the base, whose PhD the base's parser always read partial; [Bachelor, Master] on this
    // print, whose Bachelor it now reads partial, at the position the PhD had.
    const before = [
      ...whole,
      ...degreeFields(0, 'PhD', { degree: 'partial' }),
      ...degreeFields(1, 'Bachelor'),
      ...degreeFields(2, 'Master')
    ];
    const after = [
      ...whole,
      ...degreeFields(0, 'Bachelor', { degree: 'partial' }),
      ...degreeFields(1, 'Master')
    ];
    const readings = [reading(before, after)];

    expect(lostFields(before, after)).toEqual([]);
    expect(readingsUnmatched(readings)).toEqual([
      expect.objectContaining({ section: 'education', base: 3, head: 2 })
    ]);
    expect(outcome([], [], readingsUnmatched(readings)).exitCode).toBe(2);
  });

  test("adding or removing a degree the base's parser reads in full from this print loses nothing, and passes", () => {
    const two = [...whole, ...degreeFields(0, 'Bachelor'), ...degreeFields(1, 'Master')];
    const three = [...two, ...degreeFields(2, 'PhD')];

    for (const [before, after] of [
      [two, three],
      [three, two]
    ]) {
      const readings = [reading(before, after)];
      expect(lostFields(before, after)).toEqual([]);
      expect(notGradedOnBase(readings)).toEqual([]);
      expect(readingsUnmatched(readings)).toEqual([
        expect.objectContaining({ section: 'education', short: [] })
      ]);
      expect(outcome([], [], readingsUnmatched(readings)).exitCode).toBe(0);
    }
  });

  test('a section numbered differently names no loss by position, where the position holds another entry', () => {
    // A PhD added in front, which the base's parser reads partial, sits where the base's Bachelor did.
    const before = [...whole, ...degreeFields(0, 'Bachelor'), ...degreeFields(1, 'Master')];
    const after = [
      ...whole,
      ...degreeFields(0, 'PhD', { degree: 'partial' }),
      ...degreeFields(1, 'Bachelor'),
      ...degreeFields(2, 'Master')
    ];
    const readings = [reading(before, after)];

    expect(lostFields(before, after)).toEqual([]);
    expect(readingsUnmatched(readings)).toEqual([
      expect.objectContaining({
        short: [{ key: 'education.0.degree', label: 'education 1, degree', verdict: 'partial' }]
      })
    ]);
    expect(outcome(readingLosses(readings), [], readingsUnmatched(readings)).exitCode).toBe(2);
  });

  test("a field the base's grader does not grade, at a position both prints have, is still not graded on the base", () => {
    const undated = degreeFields(0, 'Master').filter((each) => !each.key.endsWith('.period'));
    const readings = [reading([...whole, ...undated], [...whole, ...degreeFields(0, 'Master')])];

    expect(readingsUnmatched(readings)).toEqual([]);
    expect(notGradedOnBase(readings)).toEqual([
      expect.objectContaining({ key: 'education.0.period', label: 'education 1, period' })
    ]);
  });

  describe('in the report', () => {
    const base = { ref: 'origin/main', commit: 'a16462e' };
    const decision = applicability(['core/AtsTextParser.js', 'profiles/general/en.json'], {
      parser: ['core/AtsTextParser.js'],
      rendering: ['profiles/']
    });
    const two = [...whole, ...degreeFields(0, 'Bachelor'), ...degreeFields(1, 'Master')];

    test('a section it could not compare fails the step, with both counts and each field read short', () => {
      const readings = ['default', 'raw'].map((order) => ({
        ...reading(two, [...two, ...degreeFields(2, 'PhD', { degree: 'lost' })]),
        order
      }));
      const text = report({
        base,
        decision,
        readings,
        losses: [],
        labels: [TRADE_LABEL],
        seconds: 1
      });

      expect(text).not.toMatch(/No field the base's parser recovered/);
      expect(text).toContain('### Not compared by position');
      expect(text).toContain(
        "- **education:** 2 entries on the base's print, 3 on this one. The base's parser reads these short from this print, and the step cannot tell a lost entry from a moved one:"
      );
      expect(text).toContain(
        "  - education 3, degree (lost) — nerd in poppler's order; nerd in content-stream order"
      );
      expect(text).toMatch(/\*\*The step fails: it could not compare every section\.\*\*/);
      expect(text).not.toMatch(/its owner accepted this trade/);
    });

    test('a section read in full is named as not compared by position, and nothing in it as lost', () => {
      const readings = [reading(two, [...two, ...degreeFields(2, 'PhD')])];
      const text = report({ base, decision, readings, losses: [], labels: [], seconds: 1 });

      expect(text).toMatch(
        /No field the base's parser recovered from the base's print is lost from this one/
      );
      expect(text).toContain(
        "- **education:** 2 entries on the base's print, 3 on this one. The base's parser reads every field of it in full from this print, so nothing in it was lost."
      );
      expect(text).not.toContain('Not graded on the base');
      expect(text).not.toMatch(/The step fails/);
    });
  });
});

describe('a trade the owner accepted', () => {
  const loss = {
    key: 'education.0.school',
    label: 'education 1, school',
    from: 'exact',
    to: 'wrong',
    was: 'Università degli Studi di Pisa',
    now: 'Development',
    written: 'Università degli Studi di Pisa'
  };

  test('the label is the one AGENTS.md and the workflow name', () => {
    expect(TRADE_LABEL).toBe('ats-trade-accepted');
  });

  test('reads the labels the workflow hands over as JSON, or as a list', () => {
    expect(pullRequestLabels('["status:in-review","ats-trade-accepted"]')).toEqual([
      'status:in-review',
      'ats-trade-accepted'
    ]);
    expect(pullRequestLabels('status:in-review, ats-trade-accepted')).toEqual([
      'status:in-review',
      'ats-trade-accepted'
    ]);
    expect(pullRequestLabels(undefined)).toEqual([]);
    expect(pullRequestLabels('')).toEqual([]);
    expect(pullRequestLabels('null')).toEqual([]);
    expect(pullRequestLabels('[]')).toEqual([]);
  });

  test('a loss fails the step', () => {
    expect(outcome([loss], [])).toEqual({ exitCode: 1, accepted: false });
    expect(outcome([loss], ['status:in-review', 'not-ats-trade-accepted'])).toEqual({
      exitCode: 1,
      accepted: false
    });
  });

  test('a loss the pull request declares an accepted trade passes, and is still a loss', () => {
    expect(outcome([loss], ['ats-trade-accepted'])).toEqual({ exitCode: 0, accepted: true });
  });

  test('no loss passes, and the label accepts nothing', () => {
    expect(outcome([], [])).toEqual({ exitCode: 0, accepted: false });
    expect(outcome([], ['ats-trade-accepted'])).toEqual({ exitCode: 0, accepted: false });
  });
});

describe('the report', () => {
  const base = { ref: 'origin/main', commit: 'a16462e' };
  const applies = applicability(['core/AtsTextParser.js', 'renderers/EducationRenderer.js'], {
    parser: ['core/AtsTextParser.js'],
    rendering: ['renderers/']
  });
  const nerd = read(print);
  const nerdFirst = read(firstPlacement);
  const readings = ['nerd', 'spotlight'].flatMap((artefact) => [
    { artefact, order: 'default', baseOnBase: nerd, baseOnHead: nerdFirst, headOnHead: nerd },
    { artefact, order: 'raw', baseOnBase: nerd, baseOnHead: nerd, headOnHead: nerd }
  ]);

  test('names each loss once, with every print and reading order it happened in', () => {
    const losses = readingLosses(readings);
    const text = report({ base, decision: applies, readings, losses, labels: [], seconds: 3.14 });

    expect(losses.filter((loss) => loss.key === 'education.0.school')).toHaveLength(2);
    const lines = text.split('\n').filter((line) => line.includes('education 1, school:'));
    expect(lines).toEqual([
      '- education 1, school: "Università degli Studi di Pisa" → "Development" (exact → wrong) — nerd, spotlight in poppler\'s order'
    ]);
    expect(text).toContain('`origin/main` at `a16462e`');
    expect(text).toContain('3.1 s');
    expect(text).toMatch(/\*\*The step fails\.\*\*/);
    expect(text).toContain('`ats-trade-accepted`');
  });

  test("reports every field beside what this branch's parser recovers, collapsing a verdict every print shares", () => {
    const mixed = [
      {
        artefact: 'nerd',
        order: 'default',
        baseOnBase: nerd,
        baseOnHead: nerdFirst,
        headOnHead: nerd
      },
      {
        artefact: 'spotlight',
        order: 'default',
        baseOnBase: nerd,
        baseOnHead: nerd,
        headOnHead: nerd
      }
    ];
    const text = report({
      base,
      decision: applies,
      readings: mixed,
      losses: readingLosses(mixed),
      labels: [],
      seconds: 1
    });

    expect(text).toContain(
      '| Field | Base parser, base print | Base parser, this print | This parser, this print |'
    );
    expect(text).toContain('| name | exact | exact | exact |');
    expect(text).toContain(
      '| **education 1, school** | exact | nerd: wrong; spotlight: exact | exact |'
    );
  });

  test('a trade the pull request declares accepted is reported as accepted', () => {
    const losses = readingLosses(readings);
    const text = report({
      base,
      decision: applies,
      readings,
      losses,
      labels: ['ats-trade-accepted'],
      seconds: 1
    });

    expect(text).toContain('education 1, school:');
    expect(text).not.toMatch(/The step fails/);
    expect(text).toMatch(/accepted/);
  });

  test('a print that loses nothing says so', () => {
    const same = [
      { artefact: 'nerd', order: 'default', baseOnBase: nerd, baseOnHead: nerd, headOnHead: nerd }
    ];
    const text = report({
      base,
      decision: applies,
      readings: same,
      losses: [],
      labels: [],
      seconds: 1
    });

    expect(text).toMatch(
      /No field the base's parser recovered from the base's print is lost from this one/
    );
    expect(text).not.toMatch(/The step fails/);
  });

  test('names each field not graded on the base once, with where, and counts none as a loss', () => {
    const undated = nerd.filter((field) => !/^education\.\d+\.period$/.test(field.key));
    const unread = [
      {
        artefact: 'nerd',
        order: 'default',
        baseOnBase: undated,
        baseOnHead: nerd,
        headOnHead: nerd
      },
      { artefact: 'nerd', order: 'raw', baseOnBase: undated, baseOnHead: nerd, headOnHead: nerd }
    ];
    const text = report({
      base,
      decision: applies,
      readings: unread,
      losses: readingLosses(unread),
      labels: [],
      seconds: 1
    });

    expect(readingLosses(unread)).toEqual([]);
    expect(text).toMatch(
      /No field the base's parser recovered from the base's print is lost from this one/
    );
    expect(text).toContain('### Not graded on the base');
    expect(text.split('\n').filter((line) => line.startsWith('- education'))).toEqual([
      "- education 1, period — nerd in poppler's order; nerd in content-stream order",
      "- education 2, period — nerd in poppler's order; nerd in content-stream order"
    ]);
  });

  test("says each print was graded against its own branch's lines, and lists nothing when every field was", () => {
    const same = [
      { artefact: 'nerd', order: 'default', baseOnBase: nerd, baseOnHead: nerd, headOnHead: nerd }
    ];
    const text = report({
      base,
      decision: applies,
      readings: same,
      losses: [],
      labels: [],
      seconds: 1
    });

    expect(text).toContain(
      "- **Graded:** the base's print against the base's own lines — its `RecoveryDiff`, `EntryLines` and catalogue — and this print against this branch's (#201)."
    );
    expect(text).not.toContain('Not graded on the base');
  });

  test('a change the step does not apply to says why, and compares nothing', () => {
    const decision = applicability(['scripts/audit-ats-base.mjs'], {
      parser: ['core/AtsTextParser.js'],
      rendering: ['renderers/']
    });
    const text = report({ base, decision });

    expect(text).toContain('it changes neither the parser nor what renders the CV');
    expect(text).not.toContain('| Field |');
  });
});

describe('the workflow', () => {
  const gates = readFileSync(`${root}.github/workflows/gates.yml`, 'utf8');
  /** One step's lines, from its comment above `- name:` to the next step. */
  const step = (text, run) => {
    const at = text.indexOf(`run: ${run}\n`);
    if (at < 0) return null;
    const start = text.lastIndexOf('\n\n', at);
    const end = text.indexOf('\n\n', at);
    return text.slice(start + 2, end < 0 ? undefined : end);
  };
  /** What would let a pull request's parser grade its own print unread. */
  const problems = (text) => {
    const found = [];
    const own = step(text, 'npm run audit:ats:base');
    if (!own) return ['no step runs npm run audit:ats:base'];
    if (!own.includes("if: github.event_name == 'pull_request'"))
      found.push('the step is not limited to a pull request');
    if (/continue-on-error/.test(own)) found.push('the step can fail without failing the job');
    if (!/CHROME_PATH: \S+/.test(own))
      found.push('the step names no browser to build the base with');
    if (
      !/PULL_REQUEST_LABELS: \$\{\{ toJSON\(github\.event\.pull_request\.labels\.\*\.name\) \}\}/.test(
        own
      )
    )
      found.push("the step is not handed the pull request's labels");
    if (!own.includes(TRADE_LABEL)) found.push('the step does not say which label accepts a trade');
    if (!own.includes('#181')) found.push('the step does not name its ticket');
    if (text.indexOf('run: npm run audit:ats:base') < text.indexOf('run: npm run audit:ats\n'))
      found.push('the step runs before audit:ats');
    return found;
  };

  test('the check finds a step that runs on every push, or without the labels', () => {
    const everywhere = gates.replace(
      "        if: github.event_name == 'pull_request'\n        run: npm run audit:ats:base",
      '        run: npm run audit:ats:base'
    );
    const unlabelled = gates.replace(/\n {10}PULL_REQUEST_LABELS:.*\n/, '\n');

    expect(everywhere).not.toBe(gates);
    expect(unlabelled).not.toBe(gates);
    expect(problems(everywhere)).toContain('the step is not limited to a pull request');
    expect(problems(unlabelled)).toContain("the step is not handed the pull request's labels");
    expect(problems(gates.replace('run: npm run audit:ats:base', 'run: true'))).toEqual([
      'no step runs npm run audit:ats:base'
    ]);
  });

  test("every pull request is read by its base branch's parser, after audit:ats", () => {
    expect(problems(gates)).toEqual([]);
  });
});

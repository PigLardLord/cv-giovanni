/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { CvDocument } from '../domain/CvDocument.js';
import {
  applicability,
  fieldVerdicts,
  lossLine,
  lostFields,
  outcome,
  productReviewPaths,
  pullRequestLabels,
  readingLosses,
  report,
  TRADE_LABEL
} from '../scripts/lib/base-parser.mjs';
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
const t = catalogueTranslator({
  cv: JSON.parse(readFileSync(`${root}locales/en/cv.json`, 'utf8'))
});
const words = { locale: 'en', credits: (count) => t('cv:education.credits', { count }) };
const read = (text) => {
  const recovered = AtsTextParser.parse(text);
  return fieldVerdicts(RecoveryDiff.diff(document, recovered, { words }), document, recovered);
};
// The print as it is, and as #179 first drew it: the scope after the school's period, not after the degree's name.
const print = readFileSync(`${root}tests/fixtures/ats/page-print-nerd.txt`, 'utf8');
const firstPlacement = print.replace(
  'Development (60 ECTS)\nUniversità degli Studi di Pisa (2014 – 2016)',
  'Development\nUniversità degli Studi di Pisa (2014 – 2016) · 60 ECTS'
);

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
        'certifications.0.name'
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
    const keys = fieldVerdicts(RecoveryDiff.diff(undated, recovered), undated, recovered).map(
      (field) => field.key
    );

    expect(keys).not.toContain('education.0.period');
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

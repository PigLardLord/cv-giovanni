/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { AtsScore, BANDS } from '../core/AtsScore.js';
import { AtsReport } from '../core/AtsReport.js';
import { catalogueTranslator } from '../scripts/lib/printed-letter.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const document = new CvDocument(
  JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'))
);
const diffOf = (fixture) =>
  RecoveryDiff.diff(
    document,
    AtsTextParser.parse(readFileSync(`${root}tests/fixtures/ats/${fixture}.txt`, 'utf8'))
  );
const scoreOf = (fixture, advert = null) => AtsScore.compose(diffOf(fixture), advert);

describe('the weights', () => {
  test('sum to one hundred', () => {
    expect(Object.values(BANDS).reduce((total, band) => total + band.weight, 0)).toBe(100);
  });

  test('every band names what its parts are worth', () => {
    const over = Object.entries(BANDS)
      .filter(([, band]) => Object.values(band.parts).reduce((a, b) => a + b, 0) > band.weight)
      .map(([name]) => name);

    expect(over).toEqual([]);
  });
});

describe('a missing input is never rescaled', () => {
  // Rescaling would let an absent advert look like a pass, which is the mistake the
  // grayscale check made when its filename pattern matched no files for weeks.
  test('with no advert the denominator drops to eighty', () => {
    const score = scoreOf('clean-english');

    expect(score.denominator).toBe(80);
    expect(score.unscored).toEqual(['advert']);
    expect(score.points).toBeLessThanOrEqual(80);
  });

  test('with an advert every band is scored', () => {
    const score = scoreOf('clean-english', {
      terms: [
        { term: 'Swift', required: true, evidence: 'inProse' },
        { term: 'CoreML', required: true, evidence: 'absent' }
      ]
    });

    expect(score.denominator).toBe(100);
    expect(score.unscored).toEqual([]);
  });
});

describe('the number moves with the damage', () => {
  const clean = scoreOf('clean-english').points;

  test('the artefact this repository ships scores near the ceiling', () => {
    expect(clean).toBeGreaterThan(72);
  });

  // A weight that never moves the number is a weight doing nothing.
  test.each([
    ['header-footer-dropped', 'contactability'],
    ['two-column-serialised', 'structure'],
    ['table-flattened', 'structure'],
    ['orphan-category', 'fidelity']
  ])('%s costs points in %s', (fixture, band) => {
    const damaged = scoreOf(fixture);

    expect(damaged.points).toBeLessThan(clean);
    expect(damaged.bands[band].points).toBeLessThan(scoreOf('clean-english').bands[band].points);
  });

  test('a document that did not segment scores zero, not NaN', () => {
    const score = scoreOf('no-headings');

    expect(Number.isFinite(score.points)).toBe(true);
    expect(score.bands.structure.points).toBe(0);
  });
});

// A degree graded partial costs half of one of education's two fields per degree: 0.5 of 80. Rounded, the report
// read "Recoverability 80/80" over a document that had lost it (#186).
describe('a loss is never rounded up to full marks', () => {
  const clean = diffOf('clean-english');
  const partial = {
    ...clean,
    education: clean.education.map((entry, index) =>
      index === 0 ? { ...entry, degree: 'partial' } : entry
    )
  };
  const headline = (diff) =>
    AtsReport.render(AtsScore.compose(diff), [{ artefact: 'x.pdf', diff }])
      .split('\n')
      .find((line) => line.includes('Recoverability') && line.includes('/'));

  test('half a degree costs half a point, and the number keeps the half', () => {
    expect(AtsScore.compose(clean).points).toBe(80);
    expect(AtsScore.compose(partial).points).toBe(79.5);
  });

  test('the headline prints the fraction, and a whole number as a whole number', () => {
    expect(headline(partial)).toMatch(/^\*\*Recoverability 79\.5\/80\*\*/);
    expect(headline(clean)).toMatch(/^\*\*Recoverability 80\/80\*\*/);
  });

  test('a fraction is cut to one decimal, never rounded, so nothing short of full marks reads as full', () => {
    expect(AtsReport.figure(80)).toBe('80');
    expect(AtsReport.figure(79.5)).toBe('79.5');
    expect(AtsReport.figure(79.96)).toBe('79.9');
    expect(AtsReport.figure(73 + 1 / 3)).toBe('73.3');
    expect(AtsReport.figure(0)).toBe('0');
  });

  // No loss this model grades is smaller than a part's weight split over its fields, so a millionth is noise.
  test("a sum's floating-point noise neither costs a tenth nor hides one", () => {
    expect(AtsReport.figure(79.49999999999999)).toBe('79.5');
    expect(AtsReport.figure(79.99999999999999)).toBe('80');
    expect(AtsReport.figure(79.9)).toBe('79.9');
  });
});

// The print #179 merged writes the Pisa degree's scope after its name. Compared as the document prints it, a parser
// that returns that line lost nothing, and the number says so; one that loses part of it costs, and the report names it.
describe('a degree scored as the document prints it', () => {
  const t = catalogueTranslator({
    cv: JSON.parse(readFileSync(`${root}locales/en/cv.json`, 'utf8'))
  });
  const words = { locale: 'en', credits: (count) => t('cv:education.credits', { count }) };
  const print = readFileSync(`${root}tests/fixtures/ats/page-print-nerd.txt`, 'utf8');
  const [pisa] = document.education;
  const scored = (text) => {
    const diff = RecoveryDiff.diff(document, AtsTextParser.parse(text), { words });
    const score = AtsScore.compose(diff);
    return { diff, score, markdown: AtsReport.render(score, [{ artefact: 'nerd.pdf', diff }]) };
  };

  test('recovered with the scope it printed, it costs nothing and reads full marks', () => {
    const { score, markdown } = scored(print);

    expect(score.bands.fidelity.parts.education).toBe(BANDS.fidelity.parts.education);
    expect(score.points).toBe(80);
    expect(markdown).toContain('**Recoverability 80/80**');
    expect(markdown).not.toMatch(/- education \d+, degree:/);
  });

  test('recovered cut short, it costs half its credit, and the report says what was lost', () => {
    const cut = "First Level Professional Master's Programme";
    const { score, markdown } = scored(
      print.replace(
        "First Level Professional Master's Programme in Mobile Applications\nDevelopment (60 ECTS)",
        cut
      )
    );

    expect(score.points).toBe(79.5);
    expect(markdown).toContain('**Recoverability 79.5/80**');
    expect(markdown).toContain(
      `- education 1, degree: partial — written "${pisa.degree} (60 ECTS)"; recovered "${cut}"`
    );
  });

  test('recovered without the scope it printed, it is a loss too', () => {
    const { score, markdown } = scored(print.replace('Development (60 ECTS)', 'Development'));

    expect(score.points).toBeLessThan(80);
    expect(markdown).toContain(
      `- education 1, degree: partial — written "${pisa.degree} (60 ECTS)"`
    );
  });

  // The rule is printed where the weights are, with its reason: a number that forgives something must say so.
  test('the report states what a degree is compared against, and why', () => {
    const composed = scored(print).markdown.split('## How the number is composed')[1];

    expect(composed).toMatch(/compared as the document prints it/);
    expect(composed).toMatch(/degreeLine/);
    expect(composed).toMatch(/lost nothing the document said/);
    expect(composed).toMatch(/cut to one decimal/);
    expect(composed).toMatch(/A certification is compared the same way/);
    expect(composed).toMatch(/_not scored_/);
  });

  // A recovered entry is matched to a written one by what it says (#217). The rule decides what a dropped or moved
  // entry costs as much as a weight does, so it is printed beside them.
  test('the report states how an entry is matched, and what one nobody wrote costs', () => {
    const composed = scored(print).markdown.split('## How the number is composed')[1];

    expect(composed).toMatch(
      /\*\*An entry is matched by what it says, not by where it stands\.\*\*/
    );
    expect(composed).toMatch(/by its title and its employer/);
    expect(composed).toMatch(/judged by the chronology alone/);
    expect(composed).toMatch(/A role nobody wrote costs/);
  });
});

// A degree's period is graded and listed, and weighs nothing (#200): the fidelity band's parts were set before it was
// graded, and weighing it changes what Recoverability is made of, which is a decision of its own. The report says so
// where the weights are.
describe("a degree's period is graded, and not scored", () => {
  const clean = readFileSync(`${root}tests/fixtures/ats/clean-english.txt`, 'utf8');
  const [pisa] = document.education;
  const diff = RecoveryDiff.diff(
    document,
    AtsTextParser.parse(clean.replace(`${pisa.school} · ${pisa.period}`, pisa.school))
  );
  const score = AtsScore.compose(diff);
  const composed = AtsReport.render(score, [{ artefact: 'x.pdf', diff }]).split(
    '## How the number is composed'
  )[1];

  test('losing it moves no point', () => {
    expect(diff.education[0].period).toBe('lost');
    expect(AtsScore.weighs(['education', 0, 'period'])).toBe(false);
    expect(score.points).toBe(scoreOf('clean-english').points);
  });

  test('the weights section says what it is compared against, what it costs, and why', () => {
    expect(composed).toMatch(/\*\*A degree's period is graded, and not scored\.\*\*/);
    expect(composed).toMatch(/`schoolLine`/);
    expect(composed).toMatch(/without the brackets/);
    expect(composed).toMatch(/prints no period has none to lose/);
    expect(composed).toMatch(/costs nothing: the fidelity band's parts were set before/);
    expect(composed).toMatch(/the title under the name, a degree's period, a certification/);
  });
});

describe('the report says what the number is not', () => {
  const score = scoreOf('clean-english');
  const markdown = AtsReport.render(score, [
    { artefact: 'nerd.pdf', diff: diffOf('clean-english') }
  ]);

  // The name matters: every commercial checker sells an "ATS score", and this is not one.
  test('it never calls itself an ATS score', () => {
    expect(markdown).not.toMatch(/ATS score/i);
    expect(markdown).toMatch(/Recoverability \d+(\.\d)?\/\d+/);
  });

  // The score itself is never a percentage or a grade. Percentages elsewhere in the page
  // are fine and necessary — the evidence note quotes one.
  test('the score is never a percentage, a grade or a threshold', () => {
    const headline = markdown.split('\n').find((line) => line.includes('Recoverability'));

    expect(headline).not.toMatch(/%/);
    expect(markdown).not.toMatch(/\b(grade|pass mark|passing score|minimum score)\b/i);
  });

  test('the weights are printed, not linked', () => {
    for (const band of [
      'Contactability',
      'Structural recovery',
      'Content fidelity',
      'Advert evidence'
    ]) {
      expect(markdown).toContain(band);
    }
    expect(markdown).toContain(String(BANDS.structure.weight));
  });

  test('it disclaims what it cannot claim', () => {
    expect(markdown).toContain('No');
    expect(markdown).toMatch(/no employer will ever see/i);
    expect(markdown).toMatch(/floor, not a prediction/i);
    expect(markdown).toMatch(/not\*{0,2}\s+rescaled/i);
  });

  test('it carries the evidence, and refuses the myth', () => {
    expect(markdown).toMatch(/92%/);
    expect(markdown).toMatch(/2012 sales pitch/);
    expect(markdown).toMatch(/not repeated here/);
  });

  test('a clean run says so rather than inventing a finding', () => {
    expect(markdown).toMatch(/Nothing\. Every field the document writes came back/);
  });

  // Scored on poppler's order, gated on both: a floor that fails only in content-stream order must still be
  // named, and named as that order's.
  test('the floors are reported per reading order', () => {
    const text = AtsReport.render(score, [
      {
        artefact: 'nerd.pdf',
        diff: diffOf('clean-english'),
        floors: { default: [], raw: ['the email address was not recovered'] }
      }
    ]);

    expect(text).toContain('## Floors, in both reading orders');
    expect(text).toMatch(/\| nerd\.pdf \| pass \| FAIL: the email address was not recovered \|/);
    expect(text).toMatch(/content-stream order.*pdftotext -raw/);
  });

  test('a damaged run quotes what did not come back', () => {
    const damaged = diffOf('orphan-category');
    const text = AtsReport.render(AtsScore.compose(damaged), [
      { artefact: 'x.pdf', diff: damaged }
    ]);

    expect(text).toContain('a category nobody wrote: "Architecture &"');
  });
});

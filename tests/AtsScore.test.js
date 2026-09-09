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

const root = fileURLToPath(new URL('..', import.meta.url));
const document = new CvDocument(JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8')));
const diffOf = (fixture) => RecoveryDiff.diff(
  document, AtsTextParser.parse(readFileSync(`${root}tests/fixtures/ats/${fixture}.txt`, 'utf8'))
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
      terms: [{ term: 'Swift', required: true, evidence: 'inProse' },
        { term: 'CoreML', required: true, evidence: 'absent' }]
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

describe('the report says what the number is not', () => {
  const score = scoreOf('clean-english');
  const markdown = AtsReport.render(score, [{ artefact: 'nerd.pdf', diff: diffOf('clean-english') }]);

  // The name matters: every commercial checker sells an "ATS score", and this is not one.
  test('it never calls itself an ATS score', () => {
    expect(markdown).not.toMatch(/ATS score/i);
    expect(markdown).toMatch(/Recoverability \d+\/\d+/);
  });

  // The score itself is never a percentage or a grade. Percentages elsewhere in the page
  // are fine and necessary — the evidence note quotes one.
  test('the score is never a percentage, a grade or a threshold', () => {
    const headline = markdown.split('\n').find((line) => line.includes('Recoverability'));

    expect(headline).not.toMatch(/%/);
    expect(markdown).not.toMatch(/\b(grade|pass mark|passing score|minimum score)\b/i);
  });

  test('the weights are printed, not linked', () => {
    for (const band of ['Contactability', 'Structural recovery', 'Content fidelity', 'Advert evidence']) {
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

  test('a damaged run quotes what did not come back', () => {
    const damaged = diffOf('orphan-category');
    const text = AtsReport.render(AtsScore.compose(damaged), [{ artefact: 'x.pdf', diff: damaged }]);

    expect(text).toContain('a category nobody wrote: "Architecture &"');
  });
});

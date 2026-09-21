/**
 * @jest-environment node
 *
 * The floors gate the build, so each one is shown failing on the damage it names, and holding on the
 * artefacts that ship — in both reading orders (#147).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { AtsFloors } from '../core/AtsFloors.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const document = new CvDocument(
  JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'))
);
const floorsOf = (fixture, against = document) =>
  AtsFloors.failures(
    RecoveryDiff.diff(
      against,
      AtsTextParser.parse(readFileSync(`${root}tests/fixtures/ats/${fixture}.txt`, 'utf8'))
    )
  );

describe('the four floors, one failure each', () => {
  test.each([
    ['no-headings', 'the document did not segment'],
    ['header-footer-dropped', 'the email address was not recovered'],
    ['table-flattened', 'a role lost its title, employer or period'],
    ['two-column-serialised', 'the chronology does not run one way']
  ])('%s: %s', (fixture, failure) => {
    expect(floorsOf(fixture)).toContain(failure);
  });

  test('a clean document fails none', () => {
    expect(floorsOf('clean-english')).toEqual([]);
  });
});

// Not a print of the page: the label beside its block that the retired pdfmake layout drew (#153). The parser still
// has to read that shape, because a stranger's CV can have it (#184).
describe('a label beside its block, as the retired pdfmake layout drew it', () => {
  // The fixture is a frozen artefact: the PDF pdfmake composed before #149, of the CV as it then read. It is graded
  // against that CV — the profile without the role added since — because a role it never printed is not a role its
  // shape lost, and editing the artefact to add one would make it prove something it never held.
  test('in content-stream order it fails no floor', () => {
    const asItThenRead = new CvDocument({
      ...JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8')),
      relevant_experience: document.experience.slice(0, 3)
    });

    expect(floorsOf('pdfmake-rail.raw', asItThenRead)).toEqual([]);
  });
});

describe('the page’s print holds in both reading orders', () => {
  test.each([
    'page-print-general-en-spotlight',
    'page-print-general-en-spotlight.raw',
    'page-print-general-en-nerd',
    'page-print-general-en-nerd.raw'
  ])('%s fails no floor', (fixture) => {
    expect(floorsOf(fixture)).toEqual([]);
  });

  // The acceptance criterion of #147: content-stream order catches what poppler's own order hid.
  test('the two-column browser print fails them in content-stream order', () => {
    expect(floorsOf('two-column-print.raw')).toEqual(
      expect.arrayContaining([
        'the email address was not recovered',
        'a role lost its title, employer or period'
      ])
    );
  });
});

// The code review of #163: two shapes the parser reads wrongly, and the floors are what keeps each from passing.
// Neither occurs in anything this project prints; both are pinned so a later change cannot make them silent.
describe('shapes the parser misreads fail a floor instead of passing', () => {
  const published = JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'));
  const print = readFileSync(
    `${root}tests/fixtures/ats/page-print-general-en-spotlight.txt`,
    'utf8'
  );
  const floorsFor = (profile, text) =>
    AtsFloors.failures(RecoveryDiff.diff(new CvDocument(profile), AtsTextParser.parse(text)));

  test('a role title that begins with a section name, read as a heading (a known limit)', () => {
    const profile = structuredClone(published);
    profile.relevant_experience[1].title = 'Training Manager';
    const text = print.replace(
      'Mobile Developer at Apparound, Pisa, Italy',
      'Training Manager at Apparound, Pisa, Italy'
    );

    expect(floorsFor(profile, text)).toContain('a role lost its title, employer or period');
  });

  test('a stray period above the first role, which flips how every role pairs with its period', () => {
    const text = print.replace('Professional Experience\n', 'Professional Experience\n2015\n');

    expect(floorsFor(published, text)).toContain('a role lost its title, employer or period');
  });
});

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
const floorsOf = (fixture) =>
  AtsFloors.failures(
    RecoveryDiff.diff(
      document,
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

describe('the page’s print holds in both reading orders', () => {
  test.each([
    'page-print-spotlight',
    'page-print-spotlight.raw',
    'page-print-nerd',
    'page-print-nerd.raw',
    'pdfmake-rail.raw'
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

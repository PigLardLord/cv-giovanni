/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const document = new CvDocument(JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8')));
const diffOf = (fixture) => RecoveryDiff.diff(
  document, AtsTextParser.parse(readFileSync(`${root}tests/fixtures/ats/${fixture}.txt`, 'utf8'))
);

describe('the ladder', () => {
  test.each([
    ['Swift', 'Swift', 'exact'],
    ['Swift', 'swift ', 'normalised'],
    ['Clean Architecture', 'Architecture', 'partial'],
    ['Cortado Mobile Solutions', 'Apparound', 'wrong'],
    ['Swift', null, 'lost'],
    ['Swift', '', 'lost']
  ])('%s against %s is %s', (authored, recovered, expected) => {
    expect(RecoveryDiff.verdict(authored, recovered)).toBe(expected);
  });

  test('a normaliser applies per type', () => {
    expect(RecoveryDiff.verdict('+39 329 8484 046', '+393298484046', 'phone')).toBe('normalised');
    expect(RecoveryDiff.verdict('A@B.com', 'a@b.com', 'email')).toBe('normalised');
    expect(RecoveryDiff.verdict('Delivery & platform', 'Delivery and platform', 'skill')).toBe('normalised');
  });

  // `partial` needs a whole-word run, or every short string would be inside every long one.
  test('a fragment is not a partial match', () => {
    expect(RecoveryDiff.verdict('Swift', 'Swi')).toBe('wrong');
    expect(RecoveryDiff.verdict('Architecture & practices', 'Architecture &', 'skill')).toBe('partial');
  });
});

describe('the artefact this repository actually ships', () => {
  const diff = diffOf('clean-english');

  test('everything is recovered, and the phone only differs in its spacing', () => {
    expect(diff.identity).toEqual({
      name: 'exact', title: 'exact', email: 'exact', phone: 'normalised', location: 'exact'
    });
  });

  test('every address is in the text layer, not only in an annotation', () => {
    expect(diff.links.every((link) => link.recovered)).toBe(true);
  });

  test('every role keeps its title, employer, period and neighbours', () => {
    expect(diff.experience).toEqual([
      { title: 'exact', employer: 'exact', period: 'exact', tripleAdjacent: true, highlights: 'exact' },
      { title: 'exact', employer: 'exact', period: 'exact', tripleAdjacent: true, highlights: 'exact' },
      { title: 'exact', employer: 'exact', period: 'exact', tripleAdjacent: true, highlights: 'exact' }
    ]);
    expect(diff.roleOrderMonotonic).toBe(true);
  });

  test('every skill stays with its own category', () => {
    expect(diff.skills.every((group) => group.category === 'exact' && group.attached)).toBe(true);
    expect(diff.skills.flatMap((group) => group.lost)).toEqual([]);
  });

  // Nothing came back that the document never wrote. This is the assertion that would catch
  // an interleave, and it cannot be expressed by asking whether a string is present.
  test('nothing was recovered that the document never wrote', () => {
    expect(diff.unexpected).toEqual({ skillCategories: [], roles: 0 });
    expect(diff.sections.missing).toEqual([]);
  });
});

describe('each defect shows up as its own kind of damage', () => {
  test('a torn category is partial, and leaves two categories nobody wrote', () => {
    const diff = diffOf('orphan-category');
    const architecture = diff.skills[diff.skills.length - 1];

    expect(architecture.category).toBe('partial');
    expect(diff.unexpected.skillCategories).toEqual(['Architecture &', 'practices']);
  });

  // The three roles are all present and every string is intact. Only their order is wrong,
  // which is precisely what no `includes()` check can see.
  test('serialised columns keep every role and break the chronology', () => {
    const diff = diffOf('two-column-serialised');

    expect(diff.roleOrderMonotonic).toBe(false);
    expect(diff.experience.map((role) => role.title)).not.toEqual(['exact', 'exact', 'exact']);
  });

  test('a flattened table loses the title and the employer together', () => {
    const diff = diffOf('table-flattened');

    expect(diff.experience[0].title).toBe('lost');
    expect(diff.experience[0].employer).toBe('lost');
    expect(diff.experience[0].tripleAdjacent).toBe(false);
  });

  test('a dropped header loses the email', () => {
    expect(diffOf('header-footer-dropped').identity.email).toBe('lost');
  });

  test('a document that did not segment loses everything downstream', () => {
    const diff = diffOf('no-headings');

    expect(diff.segmentation).toBe('failed');
    expect(diff.sections.missing.length).toBeGreaterThan(0);
    expect(diff.experience.every((role) => role.title === 'lost')).toBe(true);
  });

  test('a link that exists only as an annotation is reported lost, not assumed', () => {
    const diff = RecoveryDiff.diff(document, AtsTextParser.parse([
      'Giovanni Trovato', 'Senior iOS Engineer / Mobile Platform Owner',
      'GitHub · LinkedIn · Web CV', '', 'Professional Experience', '',
      'Mobile Software Engineer', 'Cortado · Berlin', 'August 2018 – Present', '',
      'Education', '', 'M.Sc.', 'Pisa · 2015'
    ].join('\n')));

    expect(diff.links.every((link) => link.recovered)).toBe(false);
  });
});

/**
 * @jest-environment node
 *
 * Two guarantees in one file, because they are the same guarantee from two sides: the
 * parser must not be able to look up the answer, and it must not invent one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { PlaceLexicon } from '../domain/PlaceLexicon.js';
import { DateRange } from '../domain/DateRange.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = (path) => readFileSync(`${root}${path}`, 'utf8');

const BLIND_MODULES = [
  'core/AtsTextParser.js',
  'domain/SectionLexicon.js',
  'domain/PlaceLexicon.js',
  'domain/DateRange.js',
  'domain/RecoveredCv.js',
  'domain/fold.js'
];

describe('the parser cannot read the answer key', () => {
  // A parser with access to profiles/ could confirm what it already knows and would measure
  // nothing: the whole value of this tool is that it recovers structure from the artefact
  // alone. The lexicons are included because a lexicon generated from the catalogues could
  // not detect a heading nobody outside this repository would recognise.
  test.each(BLIND_MODULES)('%s reads nothing from disk or network', (path) => {
    const text = source(path);

    expect(text).not.toMatch(/\breadFile(Sync)?\b/);
    expect(text).not.toMatch(/\bfetch\s*\(/);
    expect(text).not.toMatch(/require\s*\(/);
  });

  test.each(BLIND_MODULES)('%s imports nothing from the authored content', (path) => {
    const imports = [...source(path).matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

    for (const specifier of imports) {
      expect(specifier).not.toMatch(/profiles\//);
      expect(specifier).not.toMatch(/applications\//);
      expect(specifier).not.toMatch(/locales\//);
      expect(specifier).not.toMatch(/config\//);
    }
  });

  // The guard against the subtler version: the parser could hardcode this CV's own strings
  // and score itself perfect on the only document anyone runs it against.
  test.each(BLIND_MODULES)('%s does not name the candidate or the employer', (path) => {
    const text = source(path);

    for (const term of ['Giovanni', 'Trovato', 'Cortado', 'Apparound', 'piglardlord']) {
      expect(text).not.toContain(term);
    }
  });
});

describe('what the parser refuses to guess', () => {
  // Each of these is a finding about the document rather than a gap in the tool, and each
  // one is a place where a plausible guess would be wrong invisibly.

  test('a URL is never derived from anchor text', () => {
    const cv = AtsTextParser.parse(
      [
        'Giovanni Rossi',
        'Senior Engineer',
        'GitHub · LinkedIn · Portfolio',
        '',
        'Professional Experience',
        '',
        'Engineer',
        'Acme · Berlin',
        '2020 – 2022',
        '',
        'Education',
        '',
        'B.Sc.',
        'Somewhere · 2015'
      ].join('\n')
    );

    expect(cv.identity.addresses).toEqual([]);
  });

  test('a name is never derived from the email address', () => {
    const cv = AtsTextParser.parse(
      [
        'rossi.giovanni@example.com',
        '',
        'Professional Experience',
        '',
        'Engineer',
        'Acme · Berlin',
        '2020 – 2022',
        '',
        'Education',
        '',
        'B.Sc.',
        'X · 2015'
      ].join('\n')
    );

    expect(cv.identity.name).toBeNull();
    expect(cv.identity.email.value).toBe('rossi.giovanni@example.com');
  });

  test('a location is never read from an unrecognised place', () => {
    expect(PlaceLexicon.locationIn('Springfield, Freedonia')).toBeNull();
    expect(PlaceLexicon.locationIn('Cortado Mobile Solutions, Berlin (remote)')).toBeNull();
    expect(PlaceLexicon.locationIn('Bad Liebenstein, Thuringia, Germany')).toBe(
      'Bad Liebenstein, Thuringia, Germany'
    );
  });

  test('an employer is never bound when only one line sits above the date', () => {
    const cv = AtsTextParser.parse(
      [
        'Giovanni Rossi',
        'Engineer',
        '',
        'Professional Experience',
        '',
        'Acme · Berlin',
        '2020 – 2022',
        '',
        'Education',
        '',
        'B.Sc.',
        'X · 2015'
      ].join('\n')
    );

    expect(cv.experience[0].employer).toBeNull();
    expect(cv.experience[0].title).toBeNull();
    expect(cv.experience[0].period.raw).toBe('2020 – 2022');
  });

  test('a CEFR level is never inferred from a prose word', () => {
    const cv = AtsTextParser.parse(
      [
        'Giovanni Rossi',
        'Engineer',
        '',
        'Professional Experience',
        '',
        'Engineer',
        'Acme · Berlin',
        '2020 – 2022',
        '',
        'Languages',
        '',
        'Italian: Native',
        'English: fluent',
        'German: B2 — good'
      ].join('\n')
    );

    const levels = Object.fromEntries(cv.spokenLanguages.map((l) => [l.name, l.cefr]));
    expect(levels).toEqual({ Italian: null, English: null, German: 'B2' });
  });

  // The refusal that costs the most and is worth the most: 03/04/2021 is the third of April
  // or the fourth of March depending on the reader, and nothing in a CV decides it.
  test('an ambiguous numeric date is refused rather than assumed', () => {
    expect(DateRange.parse('03/04/2021 – 05/06/2022')).toBeNull();
    expect(DateRange.parse('03/2021 – 05/2022')).not.toBeNull();
  });
});

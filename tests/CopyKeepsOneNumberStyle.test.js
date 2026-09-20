/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { proseOf } from '../scripts/lib/line-length.mjs';

// The copy edit of #230 read the printed CV line by line and found the conventions mixed: "six years" beside
// "6 years", "2014 – 2016" spaced while "3–7" was closed, "XCTest / XCUITest" spaced while "CI/CD" was not, and em
// dashes doing the work spaced en dashes did two lines above. None of it is wrong on its own; together they read as
// a document assembled from several hands, which is the impression a CV cannot afford.
//
// One style, then: figures in numerals, ranges closed unless an end carries a space, the spaced en dash for asides
// and separators, no em dash, and no space around a slash between single words.
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('config/cv-manifest.json');
// English only: every name, level and figure below is written in English, and a German CV writes its own. A locale
// published without a list of its own would be held to this one and fail on words it never uses (#230).
const published = Object.values(manifest.profiles).flatMap(({ locales }) =>
  Object.entries(locales)
    .filter(([locale]) => locale === 'en')
    .map(([, path]) => path)
);

/** Every string a profile holds. */
const strings = (node) =>
  typeof node === 'string'
    ? [node]
    : node && typeof node === 'object'
      ? Object.values(node).flatMap(strings)
      : [];

const STYLE = [
  { rule: 'the spaced en dash separates, never an em dash', against: /—/g, where: strings },
  // A range between two bare numbers is closed: "2014–2016", "3–7". One whose ends carry spaces keeps them, since
  // "August 2018–Present" would read as one word.
  { rule: 'a range between numbers is closed', against: /\b\d+\s+[–-]\s+\d+\b/g, where: strings },
  {
    rule: 'a slash between single words is closed',
    against: /\b[\w-]+ \/ [\w-]+\b/g,
    where: strings
  },
  // A figure is read in prose, where a number spelled out reads as a different hand from the numeral beside it. A
  // list of names is not prose: "One Platform" could be a product.
  // A German reader's decimal separator is the comma, so "1,040" reads as 1.04 for a beat on a CV addressed to
  // Germany. Below five digits neither convention writes a separator, so neither does the CV (#230).
  {
    rule: 'a figure under five digits carries no separator',
    against: /\b\d{1,3},\d{3}\b/g,
    where: strings
  },
  {
    rule: 'a figure is a numeral',
    against: /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    where: proseOf
  }
];

/** Every departure from the one style, as `what → the rule it breaks`. */
const departures = (profile) =>
  STYLE.flatMap(({ rule, against, where }) =>
    where(profile).flatMap((line) =>
      (line.match(against) || []).map((found) => `${found} → ${rule}`)
    )
  );

describe('the CV writes its figures, dashes and slashes one way', () => {
  test('each departure is found, with the rule it breaks', () => {
    expect(
      departures({
        profile: 'Six years of it, from 2014 – 2016, on XCTest / XCUITest.',
        career_highlights: ['3–7 engineers and 1,040 tests, CI/CD from August 2018 – Present']
      })
    ).toEqual([
      '2014 – 2016 → a range between numbers is closed',
      'XCTest / XCUITest → a slash between single words is closed',
      '1,040 → a figure under five digits carries no separator',
      'Six → a figure is a numeral'
    ]);
  });

  test.each(published)('%s', (path) => {
    expect(departures(read(path))).toEqual([]);
  });
});

/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import nspell from 'nspell';
import englishBritish from 'dictionary-en-gb';
import { allowList, misspelt, wordsOf } from '../scripts/lib/spelling.mjs';

// Every published profile, and the labels printed beside it, spelled in its locale (#152). A locale with no dictionary
// fails rather than passing unchecked: German is enabled only once its CV is written, and a check that silently skipped
// it would read as a pass.
const DICTIONARIES = { en: englishBritish };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('config/cv-manifest.json'));
const published = Object.entries(manifest.profiles).flatMap(([profile, { locales }]) =>
  Object.entries(locales).map(([locale, path]) => ({ profile, locale, path }))
);
const spellers = new Map();
const spellerFor = (locale) => {
  if (!DICTIONARIES[locale])
    throw new Error(`no dictionary for "${locale}": add one before publishing it`);
  if (!spellers.has(locale)) {
    const dictionary = nspell(DICTIONARIES[locale]);
    spellers.set(locale, {
      correct: (word) => dictionary.correct(word),
      allowed: allowList(read(`config/spelling/${locale}.txt`))
    });
  }
  return spellers.get(locale);
};

describe('the published CV is spelled right', () => {
  test.each(published)(
    '$profile in $locale, with the labels printed beside it',
    ({ locale, path }) => {
      const words = [
        ...wordsOf(JSON.parse(read(path))),
        ...wordsOf(JSON.parse(read(`locales/${locale}/cv.json`))).map(({ word, path: key }) => ({
          word,
          path: `locales/${locale}/cv.json ${key}`
        }))
      ];

      expect(misspelt(words, spellerFor(locale))).toEqual([]);
    }
  );

  test('a misspelling planted in the profile fails, named with its path', () => {
    const profile = JSON.parse(read('profiles/general/en.json'));
    profile.relevant_experience[0].highlights[0] =
      profile.relevant_experience[0].highlights[0].replace(/\bthe\b/, 'teh');

    expect(misspelt(wordsOf(profile), spellerFor('en'))).toEqual([
      '"teh" at relevant_experience[0].highlights[0]'
    ]);
  });

  test('an American spelling fails a British CV', () => {
    expect(misspelt([{ word: 'modularization', path: 'skills' }], spellerFor('en'))).toEqual([
      '"modularization" at skills'
    ]);
  });

  test('a locale with no dictionary is refused, not skipped', () => {
    expect(() => spellerFor('de')).toThrow(/no dictionary for "de"/);
  });
});

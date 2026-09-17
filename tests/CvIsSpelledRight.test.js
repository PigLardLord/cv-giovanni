/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import nspell from 'nspell';
import englishBritish from 'dictionary-en-gb';
import { PROFILE_NOT_WORDS, allowList, misspelt, wordsOf } from '../scripts/lib/spelling.mjs';

// Every published profile, and every catalogue of its locale, spelled in its locale (#152): the labels and the page's
// own words are the CV's text as much as the profile is (the code review of #171). A locale with no dictionary
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
    '$profile in $locale, with every catalogue of its locale',
    ({ locale, path }) => {
      const catalogues = readdirSync(new URL(`../locales/${locale}/`, import.meta.url))
        .filter((name) => name.endsWith('.json'))
        .sort();
      const words = [
        ...wordsOf(JSON.parse(read(path)), { notWords: PROFILE_NOT_WORDS }),
        ...catalogues.flatMap((name) =>
          wordsOf(JSON.parse(read(`locales/${locale}/${name}`))).map(({ word, path: key }) => ({
            word,
            path: `locales/${locale}/${name} ${key}`
          }))
        )
      ];

      expect(catalogues).toEqual(expect.arrayContaining(['cv.json', 'ui.json']));
      expect(misspelt(words, spellerFor(locale))).toEqual([]);
    }
  );

  test('a misspelling planted in the profile fails, named with its path', () => {
    const profile = JSON.parse(read('profiles/general/en.json'));
    // Appended, not swapped for a word the highlight writes: replacing its first "the" planted nothing once the
    // highlight stopped writing one (#229), and a plant that depends on the copy tests the copy.
    profile.relevant_experience[0].highlights[0] += ' teh';

    expect(misspelt(wordsOf(profile, { notWords: PROFILE_NOT_WORDS }), spellerFor('en'))).toEqual([
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

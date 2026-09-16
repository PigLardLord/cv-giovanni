import { readFileSync } from 'node:fs';
import i18next from '../vendor/i18next/i18next.js';
import { runningFooterParts, runningFooterText } from '../core/RunningFooter.js';
import { catalogueTranslator } from '../scripts/lib/printed-letter.mjs';

// Page 2 of the printed CV said neither whose CV it was nor that a page 1 existed (#158). The line that says so is
// composed here from the catalogue, in parts a stylesheet can print and page counters it cannot know in advance.
const printCatalogue = (locale) =>
  JSON.parse(readFileSync(new URL(`../locales/${locale}/print.json`, import.meta.url), 'utf8'));

// The page reads the catalogue through i18next, configured as core/I18nService.js configures it.
const page = async (locale) => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    resources: { [locale]: { print: printCatalogue(locale) } },
    ns: ['print'],
    defaultNS: 'print',
    interpolation: { escapeValue: false }
  });
  return (key, values) => instance.t(key, values);
};
// The print audit reads it with a translator of its own, and expects on the paper what it composes.
const audit = (locale) => catalogueTranslator({ print: printCatalogue(locale) });

describe('the running footer of a printed CV', () => {
  test.each([
    ['en', 'Ada Lovelace · CV · '],
    ['de', 'Ada Lovelace · Lebenslauf · ']
  ])('in %s, names the candidate and the document, then counts the pages', async (locale, lead) => {
    const parts = runningFooterParts('Ada Lovelace', await page(locale));

    expect(parts).toEqual([lead, { counter: 'page' }, '/', { counter: 'pages' }]);
    expect(runningFooterText(parts, 2, 2)).toBe(`${lead}2/2`);
    // The audit composes the same line the page does.
    expect(runningFooterParts('Ada Lovelace', audit(locale))).toEqual(parts);
  });

  test('a name is written as it is, quotes and backslashes included', async () => {
    const parts = runningFooterParts('Ada "Countess" Lovelace\\King', await page('en'));

    expect(runningFooterText(parts, 3, 4)).toBe('Ada "Countess" Lovelace\\King · CV · 3/4');
  });

  // The counters are found by two private-use characters. One written in the name must not become a page number.
  test('a name cannot place a counter', async () => {
    const parts = runningFooterParts('Ada Lovelace', await page('en'));

    expect(parts).toEqual(['Ada Lovelace · CV · ', { counter: 'page' }, '/', { counter: 'pages' }]);
  });

  // A footer naming nobody would say nothing a page does not already say.
  test.each([undefined, null, '', '  ', ''])('%p is no name, and no footer', async (name) => {
    expect(runningFooterParts(name, await page('en'))).toEqual([]);
    expect(runningFooterText([], 2, 2)).toBe('');
  });

  // i18next gives back the key it cannot find, and "print:footer" is not a line to print on anyone's CV.
  test('a catalogue that writes no page count writes no footer', () => {
    expect(runningFooterParts('Ada Lovelace', catalogueTranslator({}))).toEqual([]);
    expect(runningFooterParts('Ada Lovelace', (key) => key)).toEqual([]);
  });
});

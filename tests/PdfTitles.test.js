/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { catalogueTranslator } from '../scripts/lib/printed-letter.mjs';
import { composedTitles, pdfTitle } from '../scripts/lib/pdf-titles.mjs';

// A letter's title was checked once, by hand, with pdfinfo (#324), and nothing read a printed PDF's title after it: the
// audit composed the letter without the `ui` catalogue, so its title would have read "… – ui:files.letter – …" (#340).
const catalogues = (locale) =>
  Object.fromEntries(
    ['ui', 'cv'].map((namespace) => [
      namespace,
      JSON.parse(
        readFileSync(new URL(`../locales/${locale}/${namespace}.json`, import.meta.url), 'utf8')
      )
    ])
  );
const profile = (letter) => ({
  name: 'Giovanni Trovato',
  ...(letter ? { letter } : {})
});
const letter = {
  recipient: { company: 'ActAI', address: ['Chausseestraße 1', '10115 Berlin'] },
  subject: 'Senior iOS Engineer',
  paragraphs: ['I am writing about the position.']
};

describe('the title pdfinfo reports', () => {
  test('is read whole, with its dashes', () => {
    const info = [
      'Title:           Giovanni Trovato – Curriculum Vitae',
      'Creator:         Chromium',
      'Tagged:          yes'
    ].join('\n');

    expect(pdfTitle(info)).toBe('Giovanni Trovato – Curriculum Vitae');
  });

  test('is null when the PDF carries none', () => {
    expect(pdfTitle('Creator:         Chromium\nTagged:          yes')).toBeNull();
    expect(pdfTitle('Title:           \nCreator:         Chromium')).toBeNull();
  });
});

describe('the titles the page composes', () => {
  test.each([
    [
      'en',
      'Giovanni Trovato – Curriculum Vitae',
      'Giovanni Trovato – Cover Letter – Senior iOS Engineer'
    ],
    ['de', 'Giovanni Trovato – Lebenslauf', 'Giovanni Trovato – Anschreiben – Senior iOS Engineer']
  ])('in %s: the CV is "%s", its letter "%s"', (locale, cv, letterTitle) => {
    const t = catalogueTranslator(catalogues(locale));

    expect(composedTitles(profile(letter), { t, locale })).toEqual({ cv, letter: letterTitle });
  });

  test('a profile without a letter composes none', () => {
    const t = catalogueTranslator(catalogues('en'));

    expect(composedTitles(profile(), { t, locale: 'en' }).letter).toBeNull();
  });

  // The CV's dash lives in the catalogue, the letter's in LetterContent: an edit to one alone reopens #324.
  test.each(['en', 'de'])(
    'in %s the letter parts its title with the dash the CV takes',
    (locale) => {
      const { ui } = catalogues(locale);
      const dash = /\{\{name\}\}(\P{L}+)/u.exec(ui.meta.title)[1];
      const t = catalogueTranslator(catalogues(locale));

      expect(composedTitles(profile(letter), { t, locale }).letter).toBe(
        ['Giovanni Trovato', ui.files.letter, letter.subject].join(dash)
      );
    }
  );
});

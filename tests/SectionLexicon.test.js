/**
 * @jest-environment node
 *
 * The coverage test reads the catalogues off disk, the way LocaleCatalogs.test.js does.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SECTIONS, SectionLexicon } from '../domain/SectionLexicon.js';

const localesDir = fileURLToPath(new URL('../locales/', import.meta.url));

describe('SectionLexicon.recognise', () => {
  test.each([
    ['Professional Experience', 'experience', 'en'],
    ['Berufserfahrung', 'experience', 'de'],
    ['Esperienza professionale', 'experience', 'it'],
    ['Core Technologies', 'skills', 'en'],
    ['Kernkompetenzen', 'skills', 'de'],
    ['Ausbildung', 'education', 'de'],
    ['LANGUAGES', 'languages', 'en'],
    ['  sprachen  ', 'languages', 'de']
  ])('%s is %s in %s', (line, section, language) => {
    expect(SectionLexicon.recognise(line)).toEqual({ section, language, match: 'exact' });
  });

  // One general folding rule, not one per alphabet: NFKD strips the marks, and `ß` is the
  // single exception because it decomposes to itself.
  test('accents and eszett fold without a rule each', () => {
    expect(SectionLexicon.recognise('Ausgewählte Erfolge').section).toBe('selectedImpact');
    expect(SectionLexicon.recognise('Ausgewahlte Erfolge').section).toBe('selectedImpact');
    expect(SectionLexicon.recognise('Percorso di studi').section).toBe('education');
  });

  test('prose is not a heading', () => {
    for (const line of [
      '',
      'Senior iOS engineer with 11+ years in native mobile and six years owning an MDM client.',
      'Expanded the Android test suite to ~4,800 tests.',
      'Skills: Swift, SwiftUI, UIKit, Swift Concurrency, XCTest.'
    ]) {
      expect(SectionLexicon.recognise(line)).toBeNull();
    }
  });

  test('a truncated heading is reported rather than accepted quietly', () => {
    expect(SectionLexicon.recognise('Professional Experi')).toEqual({
      section: 'experience', language: 'en', match: 'partial'
    });
  });
});

describe('every language at once', () => {
  // A CV that is Italian with one English heading still segments — and the mixture is
  // reported instead of passing as monolingual. AGENTS.md forbids mixing languages in the
  // routing; nothing has ever checked it in the rendered artefact.
  test('a mixed document is visible', () => {
    const recognised = ['Berufserfahrung', 'Education', 'Sprachen']
      .map((line) => SectionLexicon.recognise(line));

    expect(SectionLexicon.languagesUsed(recognised)).toEqual(['de', 'en']);
  });

  test('a document in one language reports one', () => {
    const recognised = ['Berufserfahrung', 'Ausbildung', 'Sprachen']
      .map((line) => SectionLexicon.recognise(line));

    expect(SectionLexicon.languagesUsed(recognised)).toEqual(['de']);
  });
});

describe('the lexicon covers every locale the project ships', () => {
  // The extensibility mechanism, and the reason this file lists nothing. The locales are
  // discovered, so the day `locales/it/` lands this test fails until the Italian synonyms
  // exist. Nobody has to remember.
  test('every section label in every catalogue is recognised', async () => {
    const locales = (await readdir(localesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(locales.length).toBeGreaterThan(0);

    // Collected rather than asserted one at a time: a failure should name every label the
    // lexicon does not know, not stop at the first.
    const unknown = [];
    for (const locale of locales) {
      const sections = JSON.parse(await readFile(`${localesDir}${locale}/cv.json`, 'utf8')).sections;
      for (const [key, label] of Object.entries(sections)) {
        const recognised = SectionLexicon.recognise(label);
        if (!recognised || recognised.section !== key || recognised.language !== locale) {
          unknown.push(`${locale}/${key}: "${label}" -> ${JSON.stringify(recognised)}`);
        }
      }
    }

    expect(unknown).toEqual([]);
  });

  test('every section knows the same set of languages', () => {
    const languages = SectionLexicon.languages();
    const incomplete = Object.entries(SECTIONS)
      .filter(([, byLanguage]) => Object.keys(byLanguage).sort().join() !== languages.join())
      .map(([section]) => section);

    expect(incomplete).toEqual([]);
  });
});

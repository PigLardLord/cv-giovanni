/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { PROFILE_NOT_WORDS, allowList, misspelt, wordsOf } from '../scripts/lib/spelling.mjs';

// Spelling errors are the best-measured penalty in CV screening: five of them cut the probability of an interview
// invitation by 18.5 percentage points, two by 7.3 (Sterkens et al., PLOS ONE 2023, 445 recruiters). Nothing checked
// the CV's text (#152). The check is offline: the dictionaries are pinned dev dependencies.
describe('the words a CV writes', () => {
  test('are read from every string with the path that holds it, not from addresses or dates', () => {
    const profile = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+49 30 1234',
      asOf: '2026-09',
      social: [{ platform: 'GitHub', url: 'https://github.com/ada' }],
      relevant_experience: [{ highlights: ["Built the team's offline-first app"] }]
    };

    expect(wordsOf(profile, { notWords: PROFILE_NOT_WORDS })).toEqual([
      { word: 'Ada', path: 'name' },
      { word: 'Lovelace', path: 'name' },
      { word: 'GitHub', path: 'social[0].platform' },
      { word: 'Built', path: 'relevant_experience[0].highlights[0]' },
      { word: 'the', path: 'relevant_experience[0].highlights[0]' },
      { word: "team's", path: 'relevant_experience[0].highlights[0]' },
      { word: 'offline', path: 'relevant_experience[0].highlights[0]' },
      { word: 'first', path: 'relevant_experience[0].highlights[0]' },
      { word: 'app', path: 'relevant_experience[0].highlights[0]' }
    ]);
  });

  // The code review of #171: the profile's address fields were skipped by key name everywhere, and a catalogue names
  // its printed labels "Email", "Phone" and "As of" with the same keys.
  test('in a catalogue, a label keyed like a profile address is words all the same', () => {
    const catalogue = { contacts: { email: 'Email', phone: 'Phone' }, pdf: { asOf: 'As of' } };

    expect(wordsOf(catalogue).map(({ word, path }) => `${word}@${path}`)).toEqual([
      'Email@contacts.email',
      'Phone@contacts.phone',
      'As@pdf.asOf',
      'of@pdf.asOf'
    ]);
  });

  test('an i18next placeholder is filled in when the string is used, so it is not a word', () => {
    expect(
      wordsOf({ footer: '{{name}} · {{documentKind}} · page {{page}}' }).map(({ word }) => word)
    ).toEqual(['page']);
  });

  test('an unclosed placeholder hides nothing after it', () => {
    const words = (text) => wordsOf({ footer: text }).map(({ word }) => word);

    expect(words('Reach out at {{email or read Tpyo culture}} more {{companyName}}')).toContain(
      'Tpyo'
    );
    expect(words('Start {{ broken middle Tpyo end }} finish')).toContain('Tpyo');
  });

  test('keep their accents, and lose no letter to a curly apostrophe', () => {
    expect(
      wordsOf({ school: 'Università di Catania', note: 'it’s' }).map(({ word }) => word)
    ).toEqual(['Università', 'di', 'Catania', 'it’s']);
  });

  test('an unknown word is named once for each place it is written, unless the allow-list has it', () => {
    const known = new Set(['Built', 'the', 'app', 'Swift']);
    const correct = (word) => known.has(word);
    const words = [
      { word: 'Built', path: 'a' },
      { word: 'teh', path: 'a' },
      { word: 'teh', path: 'a' },
      { word: 'teh', path: 'b' },
      { word: 'SwiftUI', path: 'c' }
    ];

    expect(misspelt(words, { correct, allowed: new Set(['SwiftUI']) })).toEqual([
      '"teh" at a',
      '"teh" at b'
    ]);
  });

  test('the allow-list is one term a line, with comments and blank lines ignored', () => {
    expect(allowList('# Products\nSwiftUI\n\n  Robolectric  # a test runner\n')).toEqual(
      new Set(['SwiftUI', 'Robolectric'])
    );
  });

  test('the allow-list files are sorted and hold no duplicate, so a review reads them', () => {
    const text = readFileSync(new URL('../config/spelling/en.txt', import.meta.url), 'utf8');
    const terms = text
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean);

    expect(terms).toEqual([...new Set(terms)].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

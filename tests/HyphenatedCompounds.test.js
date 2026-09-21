import { brokenCompound, hyphenatedCompounds } from '../scripts/lib/extractable-text.mjs';

// A line broken at an existing hyphen extracts without it: "offline-first" reaches a parser as "offlinefirst".
// The print audit looks for that welded form of every compound the data writes, and it read compounds with an
// ASCII class — so "Menü-Leiste" was not a compound to it, and its welded form was never looked for (#251).
describe('the hyphenated compounds a text writes', () => {
  test('are found in any script', () => {
    expect(
      hyphenatedCompounds(['Die Menü-Leiste im Groß-Projekt', 'App-Übersicht, offline-first'])
    ).toEqual(['Menü-Leiste', 'Groß-Projekt', 'App-Übersicht', 'offline-first']);
  });

  test('are each found once, however often the text writes them', () => {
    expect(hyphenatedCompounds(['offline-first', 'an offline-first app'])).toEqual([
      'offline-first'
    ]);
  });

  test('are not a range or a lone hyphen', () => {
    expect(hyphenatedCompounds(['2014–2016', 'a - b', '-x'])).toEqual([]);
  });
});

describe('the welded form of a compound', () => {
  test('is the compound with its hyphen gone, as a whole word', () => {
    expect(brokenCompound('offline-first').test('an offlinefirst app')).toBe(true);
    expect(brokenCompound('offline-first').test('an offline-first app')).toBe(false);
  });

  // `\b` is an ASCII boundary in JavaScript even under the u flag: it saw no word edge before "Ü", so a welded
  // compound that opened with one was never found. The edges are read as letters in any script instead.
  test('is found where the compound opens or closes on a letter ASCII does not know', () => {
    expect(brokenCompound('Über-Sicht').test('eine ÜberSicht.')).toBe(true);
    expect(brokenCompound('Menü-Leiste').test('die MenüLeiste')).toBe(true);
    expect(brokenCompound('Groß-Projekt').test('im GroßProjekt,')).toBe(true);
  });

  test('is not found inside a longer word', () => {
    expect(brokenCompound('Menü-Leiste').test('MenüLeistenbau')).toBe(false);
    expect(brokenCompound('Über-Sicht').test('ZurÜberSicht')).toBe(false);
  });
});

/**
 * @jest-environment node
 */
import { emptyFieldMarks, openEnds } from '../scripts/lib/empty-fields.mjs';

// A field the profile leaves out used to reach the paper as its punctuation, or as the word JavaScript writes for
// nothing: "Engineer at Acme,", "Lead Essentials – Essential Developer ()", and before #157 "undefined" (#169). The page
// is the downloadable PDF, and the published profile fills every field, so no print audit could see it. The print
// audit now reads the text layer for those traces (#178), and this is where the check is shown to fail.
const marks = (text, options) => emptyFieldMarks(text, options).map(({ mark }) => mark);

describe('the traces of an empty field in printed text', () => {
  const printed = [
    'Mobile Developer at Apparound, Pisa, Italy',
    'September 2015 – July 2018 (2 years, 11 months)',
    'Architecture & practices — Clean Architecture, MVVM, modularisation, REST APIs,',
    'TDD, code review, Git · Swift · SwiftUI, 3–7 engineers',
    'iOS Lead Essentials (TDD, Clean Architecture) – Essential Developer (2024)',
    'Università degli Studi di Pisa (2014 – 2016)'
  ].join('\n');

  test('a CV that prints every field it has carries none, lines of prose ending in a comma included', () => {
    expect(emptyFieldMarks(printed)).toEqual([]);
  });

  test('names empty brackets, with the line they printed on', () => {
    expect(
      emptyFieldMarks(
        `${printed}\nLead Essentials – Essential Developer ()\nUniversità degli Studi di Catania ( )`
      )
    ).toEqual([
      { mark: '()', line: 'Lead Essentials – Essential Developer ()' },
      { mark: '( )', line: 'Università degli Studi di Catania ( )' }
    ]);
  });

  test('names "undefined" and "null" where a field printed as the word for nothing', () => {
    expect(
      emptyFieldMarks('Mobile Developer at Apparound, undefined\nAndroid Enterprise – null (2026)')
    ).toEqual([
      { mark: 'undefined', line: 'Mobile Developer at Apparound, undefined' },
      { mark: 'null', line: 'Android Enterprise – null (2026)' }
    ]);
  });

  test('a word that only contains them is not one, and neither is a word the profile writes itself', () => {
    expect(marks('Nullable types, undefinedness')).toEqual([]);
    expect(
      marks('Adopted Kotlin null safety\nat undefined', { written: 'Adopted Kotlin null safety' })
    ).toEqual(['undefined']);
  });

  // The code review of #205: the exemption was the word's, not the occurrence's. A profile that wrote "undefined
  // behavior" once let every stray "undefined" through, a role header's included.
  test('only the occurrences the profile writes are its own: a stray one elsewhere is still named', () => {
    const written = 'Diagnosed undefined behavior in a legacy Objective-C bridge';

    expect(
      emptyFieldMarks(`${written}\nMobile Developer at Apparound, undefined`, { written })
    ).toEqual([{ mark: 'undefined', line: 'Mobile Developer at Apparound, undefined' }]);
    expect(
      marks('Adopted Kotlin null safety\nAndroid Enterprise – null (2026)', {
        written: ['Android Enterprise', 'Adopted Kotlin null safety']
      })
    ).toEqual(['null']);
  });

  test('an occurrence the profile writes is its own wherever the line breaks it', () => {
    expect(
      marks('Fixed null-\npointer crashes\nand undefined\nbehavior', {
        written: ['Fixed null-pointer crashes', 'and undefined behavior']
      })
    ).toEqual([]);
    // A compound broken at its hyphen extracts with the hyphen at the line's end, or welded shut.
    expect(
      marks('Hunted undefined use-after-\nfree bugs\nHunted undefined useafterfree bugs', {
        written: ['Hunted undefined use-after-free bugs']
      })
    ).toEqual([]);
  });

  test('names a separator doubled on its line, where the field between them printed nothing', () => {
    expect(
      marks('Germany · · +39 329\nAugust 2018 – – Present\nBerlin, , Germany\nSwift ·, SwiftUI')
    ).toEqual(['· ·', '– –', ', ,', '·,']);
  });

  test('a line ending on a separator and the next opening on one are not doubled', () => {
    expect(marks('Delivery & platform — GitLab CI/CD,\n— Fastlane')).toEqual([]);
  });

  describe('an entry that ends on the separator of a part it does not have', () => {
    test('names a role header ending in a comma, wrapped or not', () => {
      const ends = ['Mobile Developer at Apparound'];

      expect(
        emptyFieldMarks('Mobile Developer at Apparound,\nSeptember 2015 – July 2018', { ends })
      ).toEqual([
        {
          mark: 'Mobile Developer at Apparound,',
          line: 'Mobile Developer at Apparound,'
        }
      ]);
      expect(marks('Mobile Developer at\nApparound, September 2015', { ends })).toEqual([
        'Mobile Developer at Apparound,'
      ]);
      expect(marks('Mobile Developer at Apparound\nSeptember 2015 – July 2018', { ends })).toEqual(
        []
      );
    });

    test('names a certification whose dash introduces no issuer, before its year or at its end', () => {
      const ends = ['iOS Lead Essentials (TDD, Clean Architecture)'];

      expect(marks('iOS Lead Essentials (TDD, Clean Architecture) – (2024)', { ends })).toEqual([
        'iOS Lead Essentials (TDD, Clean Architecture) –'
      ]);
      expect(marks('iOS Lead Essentials (TDD, Clean Architecture)\n– ()', { ends })).toEqual([
        'iOS Lead Essentials (TDD, Clean Architecture) –',
        '()'
      ]);
      expect(marks('iOS Lead Essentials (TDD, Clean Architecture) (2024)', { ends })).toEqual([]);
    });

    test('an entry is a header only where it opens its line: prose that names it goes on', () => {
      expect(
        marks('Worked with Apparound, Pisa and Marte 5', { ends: ['Apparound', 'Marte 5'] })
      ).toEqual([]);
    });
  });
});

describe('where an entry ends on a part it does not have', () => {
  const words = { at: 'at' };
  const profile = {
    relevant_experience: [
      { title: 'Mobile Developer', company: 'Apparound', location: 'Pisa, Italy' },
      { title: 'Mobile Developer Intern', company: 'Marte 5', location: 'Livorno, Italy' }
    ],
    education: [{ degree: 'B.Sc. Computer Engineering', school: 'Catania', period: '2009' }],
    certifications: [
      { name: 'Android Enterprise Expert', issuer: 'Google', year: 2026 },
      { name: 'iOS Lead Essentials', issuer: 'Essential Developer', year: 2024 }
    ]
  };

  test('a profile that fills every part has no open end', () => {
    expect(openEnds(profile, words)).toEqual([]);
  });

  test('each entry is written as the page writes it, up to the part it leaves out', () => {
    const sparse = JSON.parse(JSON.stringify(profile));
    delete sparse.relevant_experience[0].location;
    delete sparse.education[0].period;
    delete sparse.certifications[0].year;
    delete sparse.certifications[1].issuer;

    expect(openEnds(sparse, words)).toEqual([
      'Mobile Developer at Apparound',
      'Catania',
      'Android Enterprise Expert – Google',
      'iOS Lead Essentials'
    ]);
    expect(openEnds(sparse, { at: 'bei' })[0]).toBe('Mobile Developer bei Apparound');
  });

  test('a certification with neither issuer nor year ends on its name once', () => {
    const bare = { certifications: [{ name: 'Android Enterprise Expert' }] };

    expect(openEnds(bare, words)).toEqual(['Android Enterprise Expert']);
    expect(openEnds({}, words)).toEqual([]);
  });
});

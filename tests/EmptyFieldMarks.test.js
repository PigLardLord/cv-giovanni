/**
 * @jest-environment node
 */
import { emptyFieldMarks, printedEntries } from '../scripts/lib/empty-fields.mjs';

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

  // The code review of #205: prose that writes a call, "init()", failed the audit whatever it said.
  test('empty brackets the profile writes are its own, and a stray pair elsewhere is still named', () => {
    const written = 'Refactored the legacy init() call graph to reduce startup cost';

    expect(emptyFieldMarks(written, { written })).toEqual([]);
    expect(
      emptyFieldMarks(
        `Refactored the legacy init()\ncall graph to reduce startup cost\nGoogle ()`,
        {
          written: [written, 'Google']
        }
      )
    ).toEqual([{ mark: '()', line: 'Google ()' }]);
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

  // The re-check of #205: a string that is only the mark exempted every occurrence of it.
  test('a string that is only the mark has no words to place it by, and exempts nothing', () => {
    expect(emptyFieldMarks('Mobile Developer at Apparound, null', { written: ['null'] })).toEqual([
      { mark: 'null', line: 'Mobile Developer at Apparound, null' }
    ]);
    expect(
      marks('Android Enterprise – Google ( )\nundefined', { written: ['( )', ' undefined '] })
    ).toEqual(['( )', 'undefined']);
    expect(marks('Called init()\nGoogle ()', { written: ['init()'] })).toEqual(['()']);
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
    const at = { at: 'at' };
    const roles = (...entries) => printedEntries({ relevant_experience: entries }, at);
    const certifications = (...entries) => printedEntries({ certifications: entries }, at);

    test('names a role header ending in a comma, wrapped or not', () => {
      const entries = roles({ title: 'Mobile Developer', company: 'Apparound' });

      expect(
        emptyFieldMarks('Mobile Developer at Apparound,\nSeptember 2015 – July 2018', { entries })
      ).toEqual([
        {
          mark: 'Mobile Developer at Apparound,',
          line: 'Mobile Developer at Apparound,'
        }
      ]);
      expect(marks('Mobile Developer at\nApparound,\nSeptember 2015', { entries })).toEqual([
        'Mobile Developer at Apparound,'
      ]);
      expect(
        marks('Mobile Developer at Apparound\nSeptember 2015 – July 2018', { entries })
      ).toEqual([]);
    });

    test('names a certification whose dash introduces no issuer, before its year or at its end', () => {
      const entries = certifications({
        name: 'iOS Lead Essentials (TDD, Clean Architecture)',
        year: 2024
      });

      expect(marks('iOS Lead Essentials (TDD, Clean Architecture) – (2024)', { entries })).toEqual([
        'iOS Lead Essentials (TDD, Clean Architecture) –'
      ]);
      expect(marks('iOS Lead Essentials (TDD, Clean Architecture)\n– ()', { entries })).toEqual([
        'iOS Lead Essentials (TDD, Clean Architecture) –',
        '()'
      ]);
      expect(marks('iOS Lead Essentials (TDD, Clean Architecture) (2024)', { entries })).toEqual(
        []
      );
      expect(
        marks('Android Enterprise Expert – Google –', {
          entries: certifications({ name: 'Android Enterprise Expert', issuer: 'Google' })
        })
      ).toEqual(['Android Enterprise Expert – Google –']);
    });

    // #212: the check blamed a separator only where its line ended or a year's bracket followed, so a renderer that set
    // a role's dates on its header line, after a missing location, printed "Apparound, September 2015" and passed.
    test('names a separator after a part the entry lacks, whatever follows it', () => {
      const entries = roles({ title: 'Mobile Developer', company: 'Apparound' });

      expect(
        emptyFieldMarks('Mobile Developer at Apparound, September 2015 – July 2018', { entries })
      ).toEqual([
        {
          mark: 'Mobile Developer at Apparound,',
          line: 'Mobile Developer at Apparound, September 2015 – July 2018'
        }
      ]);
      expect(marks('Mobile Developer at\nApparound, September 2015', { entries })).toEqual([
        'Mobile Developer at Apparound,'
      ]);
      expect(
        marks('Mobile Developer at Apparound September 2015 – July 2018', { entries })
      ).toEqual([]);
      expect(
        marks('iOS Lead Essentials – 2024\nAndroid Enterprise Expert – Google · expires 2027', {
          entries: certifications(
            { name: 'iOS Lead Essentials', year: 2024 },
            { name: 'Android Enterprise Expert', issuer: 'Google' }
          )
        })
      ).toEqual(['iOS Lead Essentials –', 'Android Enterprise Expert – Google ·']);
    });

    // What may follow a part an entry leaves out is the rest of the line EntryLines writes for it, not a rule of the
    // check's own. No line it writes today goes on with a separator there; one that did would not be a trace.
    test("a separator the entry's own line writes after a part it leaves out is not a trace", () => {
      const entries = [
        { kind: 'certification', start: 'CISSP', line: 'CISSP · 2021', open: ['CISSP'] }
      ];

      expect(marks('CISSP · 2021', { entries })).toEqual([]);
      expect(marks('CISSP ·\n2021', { entries })).toEqual([]);
      expect(marks('CISSP · 2020', { entries })).toEqual(['CISSP ·']);
      expect(marks('CISSP ·', { entries })).toEqual(['CISSP ·']);
    });

    // A complete entry sharing the header keeps its separator whatever its line carries after the part it has.
    test('a role sharing its header is blamed only for its own comma, whatever follows either', () => {
      const incompleteFirst = roles(
        { title: 'Engineer', company: 'Acme' },
        { title: 'Engineer', company: 'Acme', location: 'Berlin' }
      );
      const completeFirst = roles(
        { title: 'Engineer', company: 'Acme', location: 'Berlin' },
        { title: 'Engineer', company: 'Acme' }
      );

      expect(
        marks('Engineer at Acme May 2015\nEngineer at Acme, Berlin, June 2016', {
          entries: incompleteFirst
        })
      ).toEqual([]);
      expect(
        marks('Engineer at Acme, May 2015\nEngineer at Acme, Berlin, June 2016', {
          entries: incompleteFirst
        })
      ).toEqual(['Engineer at Acme,']);
      expect(
        marks('Engineer at Acme, Berlin, June 2016\nEngineer at Acme May 2015', {
          entries: completeFirst
        })
      ).toEqual([]);
      expect(
        emptyFieldMarks('Engineer at Acme, Berlin, June 2016\nEngineer at Acme, May 2015', {
          entries: completeFirst
        })
      ).toEqual([{ mark: 'Engineer at Acme,', line: 'Engineer at Acme, May 2015' }]);
    });

    // The code review of #205, and its re-check: two roles can share a header, one with a location and one without. The
    // complete one's comma introduces its location, wrapped onto the next line or not, and was blamed on the entry that
    // has none. Each entry answers only for its own line: the lines of a kind are taken in the profile's order.
    test("a role sharing its header with one that names a place is blamed only for its own line's comma", () => {
      const incompleteFirst = roles(
        { title: 'Engineer', company: 'Acme' },
        { title: 'Engineer', company: 'Acme', location: 'Berlin' }
      );
      const completeFirst = roles(
        { title: 'Engineer', company: 'Acme', location: 'Berlin' },
        { title: 'Engineer', company: 'Acme' }
      );

      expect(
        emptyFieldMarks('Engineer at Acme\nEngineer at Acme,\nBerlin', { entries: incompleteFirst })
      ).toEqual([]);
      expect(
        marks('Engineer at Acme\nEngineer at Acme, Berlin', { entries: incompleteFirst })
      ).toEqual([]);
      expect(
        emptyFieldMarks('Engineer at Acme,\nMay 2015\nEngineer at Acme,\nBerlin', {
          entries: incompleteFirst
        })
      ).toEqual([{ mark: 'Engineer at Acme,', line: 'Engineer at Acme,' }]);
      expect(
        marks('Engineer at Acme,\nBerlin\nEngineer at Acme\nMay 2015', { entries: completeFirst })
      ).toEqual([]);
      expect(
        marks('Engineer at Acme,\nBerlin\nEngineer at Acme,\nMay 2015', { entries: completeFirst })
      ).toEqual(['Engineer at Acme,']);
      expect(
        marks('Engineer at Acme\nEngineer at Acme, (remote)', {
          entries: roles(
            { title: 'Engineer', company: 'Acme' },
            { title: 'Engineer', company: 'Acme', location: '(remote)' }
          )
        })
      ).toEqual([]);
    });

    test('a certification sharing its name with one that has an issuer is blamed only for its own dash', () => {
      const entries = certifications(
        { name: 'CISSP', issuer: '(ISC)²', year: 2024 },
        { name: 'CISSP', year: 2021 }
      );

      expect(marks('CISSP – (ISC)² (2024)\nCISSP (2021)', { entries })).toEqual([]);
      expect(marks('CISSP –\n(ISC)² (2024)\nCISSP (2021)', { entries })).toEqual([]);
      expect(marks('CISSP – (ISC)² (2024)\nCISSP – (2021)', { entries })).toEqual(['CISSP –']);
    });

    test('each kind of entry is found in its own order, whichever section prints first', () => {
      const entries = [
        ...roles({ title: 'Engineer', company: 'Acme' }),
        ...certifications({ name: 'CISSP', year: 2021 })
      ];

      expect(marks('CISSP – (2021)\nEngineer at Acme,', { entries })).toEqual([
        'CISSP –',
        'Engineer at Acme,'
      ]);
    });

    test('an entry is a header only where it opens its line, and only as a whole name', () => {
      const entries = roles(
        { title: 'Engineer', company: 'Apparound' },
        { title: 'Intern', company: 'Marte 5' }
      );

      expect(marks('Worked as Engineer at Apparound, Pisa and Marte 5', { entries })).toEqual([]);
      expect(
        marks('Engineer at Apparounds GmbH, Pisa\nEngineer at Apparound,\nIntern at Marte 5', {
          entries
        })
      ).toEqual(['Engineer at Apparound,']);
    });
  });
});

describe('the entries a profile prints, and the parts each leaves out', () => {
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

  test('every entry, by kind and in the order the profile writes it, as its line opens and runs', () => {
    expect(printedEntries(profile, words)).toEqual([
      {
        kind: 'role',
        start: 'Mobile Developer at Apparound',
        line: 'Mobile Developer at Apparound, Pisa, Italy',
        open: []
      },
      {
        kind: 'role',
        start: 'Mobile Developer Intern at Marte 5',
        line: 'Mobile Developer Intern at Marte 5, Livorno, Italy',
        open: []
      },
      { kind: 'school', start: 'Catania', line: 'Catania (2009)', open: [] },
      {
        kind: 'certification',
        start: 'Android Enterprise Expert',
        line: 'Android Enterprise Expert – Google (2026)',
        open: []
      },
      {
        kind: 'certification',
        start: 'iOS Lead Essentials',
        line: 'iOS Lead Essentials – Essential Developer (2024)',
        open: []
      }
    ]);
  });

  test('each entry is written as the page writes it, up to each part it leaves out', () => {
    const sparse = JSON.parse(JSON.stringify(profile));
    delete sparse.relevant_experience[0].location;
    delete sparse.education[0].period;
    delete sparse.certifications[0].year;
    delete sparse.certifications[1].issuer;

    expect(printedEntries(sparse, words).map(({ open }) => open)).toEqual([
      ['Mobile Developer at Apparound'],
      [],
      ['Catania'],
      ['Android Enterprise Expert – Google'],
      ['iOS Lead Essentials']
    ]);
    expect(printedEntries(sparse, { at: 'bei' })[0]).toEqual({
      kind: 'role',
      start: 'Mobile Developer bei Apparound',
      line: 'Mobile Developer bei Apparound',
      open: ['Mobile Developer bei Apparound']
    });
  });

  // #212: what may follow a part an entry leaves out is the rest of its own line, not what a hand-written rule guesses.
  test('each entry runs as the page writes its line without the parts it leaves out', () => {
    const sparse = JSON.parse(JSON.stringify(profile));
    delete sparse.relevant_experience[0].location;
    delete sparse.education[0].period;
    delete sparse.certifications[0].year;
    delete sparse.certifications[1].issuer;

    expect(printedEntries(sparse, words).map(({ line }) => line)).toEqual([
      'Mobile Developer at Apparound',
      'Mobile Developer Intern at Marte 5, Livorno, Italy',
      'Catania',
      'Android Enterprise Expert – Google',
      'iOS Lead Essentials (2024)'
    ]);
  });

  test('a certification with neither issuer nor year ends on its name once', () => {
    const bare = { certifications: [{ name: 'Android Enterprise Expert' }] };

    expect(printedEntries(bare, words)).toEqual([
      {
        kind: 'certification',
        start: 'Android Enterprise Expert',
        line: 'Android Enterprise Expert',
        open: ['Android Enterprise Expert']
      }
    ]);
    expect(printedEntries({}, words)).toEqual([]);
    expect(printedEntries({ relevant_experience: [null, 'Engineer'] }, words)).toEqual([]);
  });
});

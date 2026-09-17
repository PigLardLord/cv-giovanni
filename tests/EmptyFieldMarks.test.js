/**
 * @jest-environment node
 */
import { emptyFieldMarks, entrySections, printedEntries } from '../scripts/lib/empty-fields.mjs';

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

    // #213: each entry took the first line its start opened, so a line of prose opening with a later role's whole
    // header took that role's place. The role's own dangling comma went unchecked, and prose going on with a comma was
    // blamed instead.
    describe("a line of prose that opens with an entry's header", () => {
      const entries = roles(
        { title: 'Mobile Software Engineer', company: 'Cortado', location: 'Berlin' },
        { title: 'Mobile Developer', company: 'Apparound' }
      );
      const header = 'Mobile Software Engineer at Cortado, Berlin';

      test("is not the entry's line, whose dangling separator is still named", () => {
        const written = [
          'Mobile Developer at Apparound alumni now lead two of the three mobile teams.'
        ];
        const text = [
          header,
          'Mobile Developer at Apparound alumni now lead two of the three',
          'mobile teams.',
          'Mobile Developer at Apparound,',
          'September 2015 – July 2018'
        ].join('\n');

        expect(emptyFieldMarks(text, { entries, written })).toEqual([
          { mark: 'Mobile Developer at Apparound,', line: 'Mobile Developer at Apparound,' }
        ]);
      });

      test('is not blamed for the separator it goes on with', () => {
        const written = [
          'Mobile Developer at Apparound, Marte 5 and Cortado: three mobile teams in nine years.'
        ];
        const prose = [
          'Mobile Developer at Apparound, Marte 5 and Cortado: three mobile',
          'teams in nine years.'
        ];

        expect(
          marks([header, ...prose, 'Mobile Developer at Apparound', 'September 2015'].join('\n'), {
            entries,
            written
          })
        ).toEqual([]);
        expect(
          emptyFieldMarks(
            [header, ...prose, 'Mobile Developer at Apparound, September 2015'].join('\n'),
            { entries, written }
          )
        ).toEqual([
          {
            mark: 'Mobile Developer at Apparound,',
            line: 'Mobile Developer at Apparound, September 2015'
          }
        ]);
      });

      test("is not the entry's line where it wraps onto the header mid-string, past a broken compound", () => {
        const written = ['Mentored an offline-first Mobile Developer at Apparound, later a lead.'];
        const text = [
          header,
          'Mentored an offline-',
          'first',
          'Mobile Developer at Apparound, later a lead.',
          'Mobile Developer at Apparound',
          'September 2015'
        ].join('\n');

        expect(marks(text, { entries, written })).toEqual([]);
      });

      test('an entry whose start is a string the profile writes is still found at its own line', () => {
        expect(
          marks('CISSP – (2021)', {
            entries: certifications({ name: 'CISSP', year: 2021 }),
            written: ['CISSP']
          })
        ).toEqual(['CISSP –']);
        expect(
          marks('Università di Pisa,\n2016', {
            entries: printedEntries({ education: [{ school: 'Università di Pisa' }] }, at),
            written: ['Università di Pisa']
          })
        ).toEqual(['Università di Pisa,']);
      });

      // The code review of #213: a string the profile writes that runs past the start was prose wherever it printed,
      // the entry's own line included, so a string the header line prints whole hid that line and its trace.
      test("a string the entry's own line prints is prose only where it prints more than that line", () => {
        const entries = [
          {
            kind: 'role',
            start: 'Mobile Developer at Apparound',
            line: 'Mobile Developer at Apparound, Pisa, Italy',
            open: ['Mobile Developer at Apparound, Pisa, Italy']
          }
        ];

        expect(
          emptyFieldMarks(
            [
              'Professional Experience',
              'Mobile Developer at Apparound, Pisa, Italy,',
              'September 2015 - July 2018'
            ].join('\n'),
            { entries, written: ['Mobile Developer at Apparound, Pisa, Italy'] }
          )
        ).toEqual([
          {
            mark: 'Mobile Developer at Apparound, Pisa, Italy,',
            line: 'Mobile Developer at Apparound, Pisa, Italy,'
          }
        ]);
        // A string the line opens with, printed on a line of its own, is not that line.
        expect(
          emptyFieldMarks(
            [
              'Mobile Developer at Apparound, Pisa',
              'Mobile Developer at Apparound, Pisa, Italy,',
              'September 2015 - July 2018'
            ].join('\n'),
            { entries, written: ['Mobile Developer at Apparound, Pisa'] }
          )
        ).toEqual([
          {
            mark: 'Mobile Developer at Apparound, Pisa, Italy,',
            line: 'Mobile Developer at Apparound, Pisa, Italy,'
          }
        ]);
      });
    });

    // The re-check of #213: a string the profile writes that is the entry's whole line prints the same wherever it
    // prints, so a copy of it outside the entry's section took the header's place. Each kind is looked for in its own
    // section, from its heading to the next.
    describe('where a section is given for its kind', () => {
      test('an entry is found only under its own heading, whatever prints the same line before it', () => {
        const entries = [
          {
            kind: 'role',
            start: 'Mobile Developer at Apparound',
            line: 'Mobile Developer at Apparound, Pisa, Italy',
            open: ['Mobile Developer at Apparound, Pisa, Italy']
          }
        ];
        const text = [
          'Career highlights',
          'Mobile Developer at Apparound, Pisa, Italy',
          '',
          'Professional Experience',
          'Mobile Developer at Apparound, Pisa, Italy,',
          'September 2015 - July 2018'
        ].join('\n');

        expect(
          emptyFieldMarks(text, {
            entries,
            written: ['Mobile Developer at Apparound, Pisa, Italy'],
            sections: { role: 'Professional Experience' },
            headings: ['Career highlights', 'Professional Experience']
          })
        ).toEqual([
          {
            mark: 'Mobile Developer at Apparound, Pisa, Italy,',
            line: 'Mobile Developer at Apparound, Pisa, Italy,'
          }
        ]);
      });

      test('a certification named in a highlight outside its section does not take its place', () => {
        const options = {
          entries: certifications({ name: 'Android Enterprise Expert', issuer: 'Google' }),
          sections: { certification: 'Certifications' },
          headings: ['Selected Impact', 'Professional Experience', 'Certifications', 'Education']
        };
        const printed = (certification) =>
          [
            'Selected Impact',
            'Android Enterprise Expert – Google, renewed every year since 2019',
            'Professional Experience',
            'Engineer at Acme, Berlin',
            'Certifications',
            certification,
            'Education',
            'Università di Pisa (2016)'
          ].join('\n');

        expect(marks(printed('Android Enterprise Expert – Google'), options)).toEqual([]);
        expect(emptyFieldMarks(printed('Android Enterprise Expert – Google –'), options)).toEqual([
          {
            mark: 'Android Enterprise Expert – Google –',
            line: 'Android Enterprise Expert – Google –'
          }
        ]);
      });

      test('a section runs from its heading, alone on its line, to the next heading, or is the whole text', () => {
        const entries = roles({ title: 'Engineer', company: 'Acme' });
        const sections = { role: 'Professional Experience' };
        const headings = ['Professional Experience', 'Education'];

        // What prints under the next heading is not the section's.
        expect(
          marks('Professional Experience\nEngineer at Acme\nEducation\nEngineer at Acme, Berlin', {
            entries,
            sections,
            headings
          })
        ).toEqual([]);
        // A heading at the top of a page prints after the page break.
        expect(
          marks('Engineer at Acme,\n\fProfessional Experience\nEngineer at Acme', {
            entries,
            sections,
            headings
          })
        ).toEqual([]);
        // A heading's words inside a line of prose are not the heading.
        expect(
          marks(
            'Engineer at Acme, Professional Experience\nEngineer at Acme,\nProfessional Experience\nEngineer at Acme',
            { entries, sections, headings }
          )
        ).toEqual([]);
        // A heading that does not print bounds nothing, and the whole text is searched, as with no section at all.
        expect(marks('Experience\nEngineer at Acme,', { entries, sections, headings })).toEqual([
          'Engineer at Acme,'
        ]);
        expect(marks('Engineer at Acme,', { entries })).toEqual(['Engineer at Acme,']);
      });
    });
  });
});

describe('the sections each kind of entry prints in', () => {
  test("each kind's heading, from the catalogue's section labels, and every heading that can end a section", () => {
    const labels = {
      skills: 'Core Technologies',
      experience: 'Professional Experience',
      education: 'Education',
      certifications: 'Certifications',
      languages: 'Languages'
    };

    expect(entrySections(labels)).toEqual({
      sections: {
        role: 'Professional Experience',
        school: 'Education',
        certification: 'Certifications'
      },
      headings: [
        'Core Technologies',
        'Professional Experience',
        'Education',
        'Certifications',
        'Languages'
      ]
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

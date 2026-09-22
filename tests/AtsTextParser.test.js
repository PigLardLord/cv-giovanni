/**
 * @jest-environment node
 *
 * The fixtures are read off disk: they are the specification, and a copy inlined here would
 * drift from the one the audit actually runs against.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { DateRange } from '../domain/DateRange.js';

const fixtures = fileURLToPath(new URL('./fixtures/ats/', import.meta.url));
const parse = (name) => AtsTextParser.parse(readFileSync(`${fixtures}${name}.txt`, 'utf8'));

describe('a clean document, as the artefact actually extracts', () => {
  const cv = parse('clean-english');

  test('it segments, in one language', () => {
    expect(cv.segmentation).toBe('ok');
    expect(cv.languages).toEqual(['en']);
    expect(cv.sections.map((section) => section.section)).toEqual([
      'experience',
      'skills',
      'education',
      'languages',
      'certifications'
    ]);
  });

  test('the contacts come back', () => {
    expect(cv.identity.name.value).toBe('Giovanni Trovato');
    expect(cv.identity.title.value).toBe('Senior iOS Engineer');
    expect(cv.identity.email.value).toBe('trovato.giovanni@gmail.com');
    expect(cv.identity.phone.value).toBe('+393298484046');
    expect(cv.identity.location.value).toBe('Bad Liebenstein, Thuringia, Germany');
  });

  // The CV is full of numbers that a digit-counting regex would take for a telephone.
  test('no measurement is mistaken for a phone number', () => {
    for (const line of [
      'Expanded the test suite to ~4,800 tests',
      'from 15% to 82%',
      'cutting CI runtime by 75% (32 to 8 minutes)',
      'a mobile team of 3–7 engineers',
      'MDM Android, 2026: 1,040 → 5,308 tests, branch coverage 14% → 83%',
      'Cortado MDM for iOS (since 2020; ~30k downloads by 2026)',
      '300k downloads since release, 15k still installed in 2026.',
      'and cut summed test runtime from a July peak of 37.7 to 5.2 minutes.',
      'in a mobile team of two since 2020.'
    ]) {
      expect(AtsTextParser.phone([line])).toBeNull();
    }
  });

  test('every address is recovered whole', () => {
    expect(cv.identity.addresses.map((address) => address.value)).toEqual([
      'github.com/PigLardLord',
      'linkedin.com/in/piglardlord',
      'piglardlord.github.io/cv-giovanni'
    ]);
  });

  test('the roles come back in order, each with its own employer and period', () => {
    expect(cv.experience.map((role) => role.employer.value)).toEqual([
      'Cortado Mobile Solutions',
      'Apparound',
      'Marte 5',
      'Compusoft'
    ]);
    expect(cv.tripleAdjacent).toBe(true);
    expect(cv.roleOrderMonotonic).toBe(true);
  });

  test('each skill category keeps its own list', () => {
    expect(cv.skills.map((group) => group.category)).toEqual([
      'iOS',
      'Android',
      'Delivery',
      'Architecture and practices'
    ]);
    expect(cv.skills[0].items).toContain('Swift');
    // Split on `,` and `·` only: on `/` this would shatter into halves that are not skills.
    expect(cv.skills[2].items).toContain('GitLab CI/CD');
  });

  test('a CEFR level is read only where one was written', () => {
    expect(cv.spokenLanguages.map((language) => [language.name, language.cefr])).toEqual([
      ['Italian', null],
      ['English', 'C1'],
      ['German', 'A1']
    ]);
  });
});

describe('the pathological shapes, each failing the check it was written for', () => {
  // Fewer than two headings is not a document with little structure; it is one whose
  // structure did not survive. Reporting the fields anyway would be invention.
  test('no headings: segmentation fails and nothing downstream is claimed', () => {
    const cv = parse('no-headings');

    expect(cv.segmentation).toBe('failed');
    expect(cv.experience).toEqual([]);
    expect(cv.skills).toEqual([]);
    expect(cv.education).toEqual([]);
  });

  test('a dropped header takes the email with it', () => {
    const cv = parse('header-footer-dropped');

    expect(cv.segmentation).toBe('ok');
    expect(cv.identity.email).toBeNull();
  });

  // Columns serialised down one side and then the other put the intern first. Every string
  // is present and the career is nonsense — which no `includes()` check can see.
  test('two columns serialised: the chronology stops running one way', () => {
    const cv = parse('two-column-serialised');

    expect(cv.experience).toHaveLength(3);
    expect(cv.roleOrderMonotonic).toBe(false);
  });

  // One line above the date is not enough to tell a title from an employer, so neither is
  // claimed. A guess here binds the wrong string to the wrong field, invisibly.
  test('a flattened table leaves the role without a title, and none is invented', () => {
    const cv = parse('table-flattened');

    expect(cv.experience).toHaveLength(1);
    expect(cv.experience[0].title).toBeNull();
    expect(cv.experience[0].employer).toBeNull();
    expect(cv.experience[0].tripleAdjacent).toBe(false);
  });

  test('mixed date formats are counted, not smoothed over', () => {
    const cv = parse('mixed-dates');
    const written = cv.experience.map((role) => role.period.raw);

    expect(DateRange.shapes(written)).toBe(3);
  });

  // Everything downstream must work with no English in the document at all.
  test('German labels segment the same document', () => {
    const cv = parse('german-labels');

    expect(cv.languages).toEqual(['de']);
    expect(cv.sections.map((section) => section.section)).toEqual([
      'experience',
      'education',
      'languages'
    ]);
    expect(cv.experience[0].employer.value).toBe('Cortado Mobile Solutions');
    expect(cv.experience[0].period.end).toBe('present');
  });

  // The real defect, before it was fixed: a category torn in half by a wrapping column
  // arrives as two categories and a list belonging to neither.
  test('an orphaned category is recovered as the two categories it became', () => {
    const cv = parse('orphan-category');

    expect(cv.skills.map((group) => group.category)).toEqual([
      'iOS',
      'Architecture &',
      'practices'
    ]);
    expect(cv.skills.map((group) => group.category)).not.toContain('Architecture & practices');
  });
});

// The page's own print (#147), extracted from Chrome's PDF of each layout at the commit that last changed them,
// which `git log -1 -- tests/fixtures/ats/page-print-*` names: a SHA written here drifts on every content commit
// (the code review of #229). Technical Profile
// extracts to the same bytes as Impact Spotlight in both reading orders, so one fixture stands for both.
// The roles, degrees and skills are asserted as recovered strings rather than diffed against the profile,
// so a copy edit in the profile does not silently change what these fixtures prove.
const ROLES = [
  ['iOS Developer', 'Cortado Mobile Solutions', 'Berlin (remote)'],
  ['Mobile Developer', 'Apparound', 'Pisa, Italy'],
  ['Mobile Developer Intern', 'Marte 5', 'Livorno, Italy'],
  ['IT System Administrator', 'Compusoft', 'Modica, Italy']
];
const identityOf = (role) => [role.title?.value, role.employer?.value, role.location?.value];

describe('the printed page, in the order poppler reads it', () => {
  // "Title at Company, City", as the page writes a role. Once it wraps after "at", once it does not.
  test('Impact Spotlight: every role reads "Title at Company, City" above its period', () => {
    const cv = parse('frozen-print-general-en-spotlight');

    expect(cv.experience.map(identityOf)).toEqual(ROLES);
    expect(cv.experience.map((role) => role.period.span)).toEqual([
      'August 2018 – November 2026',
      'September 2015 – July 2018',
      'May 2015 – August 2015',
      'May 2010 – November 2014'
    ]);
    expect(cv.tripleAdjacent).toBe(true);
    expect(cv.roleOrderMonotonic).toBe(true);
  });

  // Nerd Mode draws the period in a column of its own, which poppler reads as the line above the title.
  test('Nerd Mode: the period comes first, and every role still gets its own', () => {
    const cv = parse('frozen-print-general-en-nerd');

    expect(cv.experience.map(identityOf)).toEqual(ROLES);
    expect(cv.experience.map((role) => role.period.raw)).toEqual([
      'August 2018 – November 2026',
      'September 2015 – July 2018',
      'May 2015 – August 2015',
      'May 2010 – November 2014'
    ]);
    expect(cv.tripleAdjacent).toBe(true);
  });

  // A role's achievements run up to the next role's header, whichever side of its period that header is.
  test.each([
    'page-print-general-en-technical',
    'frozen-print-general-en-spotlight',
    'frozen-print-general-en-nerd'
  ])('%s: the achievements before the next header belong to the role above', (fixture) => {
    const [first, second] = parse(fixture).experience;

    expect(first.bodyText).toContain('Earlier products, 2018–2023');
    expect(first.bodyText).toContain('mentoring 2 developers in it;');
    expect(first.bodyText).not.toContain('Mobile Developer at Apparound');
    expect(first.bodyText).not.toContain('September 2015');
    expect(second.bodyText).toContain('B2B sales-automation platform');
    expect(second.bodyText).not.toContain('staged rollout');
  });

  // The scope a degree states after its name (#48) is drawn on the degree's line, and read as part of the degree.
  test.each([
    'page-print-general-en-technical',
    'frozen-print-general-en-spotlight',
    'frozen-print-general-en-nerd'
  ])('%s: a wrapped degree stays one degree, and "School (period)" splits', (fixture) => {
    const cv = parse(fixture);

    expect(
      cv.education.map((entry) => [entry.degree.value, entry.school.value, entry.period])
    ).toEqual([
      [
        "First Level Professional Master's Programme in Mobile Applications Development (60 ECTS)",
        'Università degli Studi di Pisa',
        '2014–2016'
      ],
      ['BSc in Computer Engineering', 'Università degli Studi di Catania', '2009']
    ]);
  });

  /** A CV of a name, one role and one degree, whose school line is the one given. */
  const educationAfterARole = (schoolLine) =>
    [
      'Ada Lovelace',
      'Experience',
      'Engineer at Acme',
      '2015 – 2018',
      '',
      'Education',
      '',
      'M.Sc. Informatics',
      schoolLine
    ].join('\n');

  // With no line in a paragraph closing on a period, the school line's second segment was taken for the period
  // unread: a city or a credit count came back as the period (#187).
  test.each([
    ['a city', 'Technische Universität München · Munich', 'Technische Universität München'],
    [
      'a credit count',
      'Università degli Studi di Pisa · 120 ECTS',
      'Università degli Studi di Pisa'
    ]
  ])('a school line whose second segment is %s recovers no period', (what, line, school) => {
    const cv = AtsTextParser.parse(educationAfterARole(line));

    expect(
      cv.education.map((entry) => [entry.degree.value, entry.school.value, entry.period])
    ).toEqual([['M.Sc. Informatics', school, null]]);
  });

  // A period DateRange has no notation for is still a period when it names a year: the gate that turned away a city
  // must not turn away a semester (the code review of #188).
  test.each([
    ['a semester range', 'WS 2014/15 – SS 2016'],
    ['a German semester', 'Wintersemester 2014'],
    ['a German semester with its academic year', 'Wintersemester 2014/15'],
    ['a season with its academic year', 'Fall 2014/15'],
    ['a season', 'Fall 2014'],
    ['a range of seasons', 'Spring 2016 – Fall 2018'],
    // Notations a CV writes that the first pattern did not cover (#192).
    ['a semester with a four-digit second year', 'WS 2014/2015'],
    ['a range opening on a four-digit second year', 'WS 2014/2015 – SS 2016'],
    ['a season named a semester', 'Fall Semester 2014'],
    ['a season named a term', 'Spring Term 2016'],
    ['a compact winter semester', 'WS16/17'],
    ['a compact summer semester', 'SS16'],
    ['a range of compact semesters', 'WS16/17 – SS18'],
    ['a compact semester with a four-digit year', 'SoSe2016'],
    ['an abbreviated semester with a two-digit year', 'WiSe 16/17'],
    ['a season closing on a full stop', 'Fall 2014.'],
    ['a range closing on a full stop', 'WS 2014/2015 – SS 2016.']
  ])('a school line whose second segment is %s keeps it as the period', (what, period) => {
    const cv = AtsTextParser.parse(educationAfterARole(`TU München · ${period}`));

    expect(cv.education.map((entry) => [entry.school.value, entry.period])).toEqual([
      ['TU München', period]
    ]);
  });

  // Naming a year is not enough: an institution's facts carry years too (the second code review of #188).
  test.each([
    'Campus 2000',
    'Founded 2005',
    'Est. 1999',
    '2000 students',
    'Room 2024',
    // A season word opens a term only as a whole word, and only "Semester" or "Term" may follow it (#192).
    'Summer School 2019',
    'Fall River 2014',
    'Winterthur 2014',
    // A semester abbreviation is a term only when a year of two or four digits closes it.
    'SS2000 Building',
    'SS200',
    'WS-Consulting'
  ])('a school line whose second segment is "%s" recovers no period', (segment) => {
    const cv = AtsTextParser.parse(educationAfterARole(`TU München · ${segment}`));

    expect(cv.education.map((entry) => [entry.school.value, entry.period])).toEqual([
      ['TU München', null]
    ]);
  });

  test('a school line whose period is followed by another segment still finds it', () => {
    const cv = AtsTextParser.parse(educationAfterARole('TU München · 2019 – 2021 · 120 ECTS'));

    expect(cv.education.map((entry) => [entry.school.value, entry.period])).toEqual([
      ['TU München', '2019 – 2021']
    ]);
  });

  test.each([
    'page-print-general-en-technical',
    'frozen-print-general-en-spotlight',
    'frozen-print-general-en-nerd'
  ])(
    '%s: "Category — items" keeps each list with its category, across wrapped lines',
    (fixture) => {
      const cv = parse(fixture);

      expect(cv.skills.map((group) => group.category)).toEqual([
        'iOS',
        'Android',
        'Delivery',
        'Architecture and practices'
      ]);
      expect(cv.skills[0].items).toContain('Swift Package Manager');
      expect(cv.skills[1].items).toContain('DevicePolicyManager');
      expect(cv.skills[2].items).toContain('code signing and provisioning');
      expect(cv.skills[3].items).toContain('agentic development');
    }
  );
});

// `pdftotext -raw`: the order the content stream draws, which PDFBox and Tika read by default. It writes no
// blank lines at all, so nothing here may depend on one.
describe('the same artefacts, in content-stream order', () => {
  test('Impact Spotlight segments with no blank line to lean on', () => {
    const cv = parse('frozen-print-general-en-spotlight.raw');

    expect(cv.segmentation).toBe('ok');
    expect(cv.sections.map((section) => section.section)).toEqual([
      'selectedImpact',
      'experience',
      'skills',
      'certifications',
      'education',
      'languages',
      'interests'
    ]);
    expect(cv.identity.email.value).toBe('trovato.giovanni@gmail.com');
    expect(cv.experience.map(identityOf)).toEqual(ROLES);
    expect(cv.tripleAdjacent).toBe(true);
    expect(cv.roleOrderMonotonic).toBe(true);
  });

  // Drawn first, the period shares the title's line: "September 2015 – July 2018 Mobile Developer at …".
  test('Nerd Mode: a period that opens the title line is read as the role it opens', () => {
    const cv = parse('frozen-print-general-en-nerd.raw');

    expect(cv.segmentation).toBe('ok');
    expect(cv.experience.map(identityOf)).toEqual(ROLES);
    expect(cv.experience.map((role) => role.period.raw)).toEqual([
      'August 2018 – November 2026',
      'September 2015 – July 2018',
      'May 2015 – August 2015',
      'May 2010 – November 2014'
    ]);
    expect(cv.tripleAdjacent).toBe(true);
    expect(cv.roleOrderMonotonic).toBe(true);
  });

  // Since #230 the print keeps every role whole on one page, so no body crosses a page break. What this holds is
  // what that leaves: the first role's body comes back as the lines poppler wrote, in order, and stops at the next
  // role's header.
  test("a role's body is its own lines, up to the next role's header", () => {
    const [first] = parse('frozen-print-general-en-spotlight.raw').experience;

    expect(first.bodyLines).toContain('from a July 2026 peak of 37.7 to 5.2 minutes.');
    expect(first.bodyLines.some((line) => line.startsWith('Earlier products, 2018–2023'))).toBe(
      true
    );
    expect(first.bodyLines.some((line) => line.includes('Apparound'))).toBe(false);
  });

  // A layout that sets each label in a rail beside its block draws it on the block's first baseline, so
  // the content stream welds the two: "Professional Experience Mobile Software Engineer / …". The
  // fixture is the PDF pdfmake composed that way until #149.
  test('a section label beside its block is read as the heading it is', () => {
    const cv = parse('pdfmake-rail.raw');

    expect(cv.segmentation).toBe('ok');
    expect(cv.sections.map((section) => section.section)).toEqual([
      'experience',
      'skills',
      'education',
      'languages',
      'certifications'
    ]);
    expect(cv.identity.email.value).toBe('trovato.giovanni@gmail.com');
    expect(cv.experience.map((role) => [role.title?.value, role.employer?.value])).toEqual([
      ['Mobile Software Engineer / Technical Owner, iOS & Android', 'Cortado Mobile Solutions'],
      ['Mobile Developer', 'Apparound'],
      ['Mobile Developer Intern', 'Marte 5']
    ]);
    expect(cv.tripleAdjacent).toBe(true);
  });

  // The browser print on main at 2b53cf5, before #156 laid it out in one column: the skills first, the
  // name on line 46, the section headings after their sections.
  test('the two-column browser print recovers no contact and no career', () => {
    const cv = parse('two-column-print.raw');

    expect(cv.identity.email).toBeNull();
    expect(cv.experience.map(identityOf)).not.toEqual(ROLES);
  });
});

describe('which way a section runs is read off its first entry', () => {
  // Two roles with no achievements are the one shape where a period sits between two headers. The section's
  // first line settles which of them it belongs to, the way a reader settles it.
  test.each([
    [
      'the header first',
      ['Engineer at Acme, Berlin', '2020 – 2022', 'Developer at Beta, Pisa', '2018 – 2020']
    ],
    [
      'the period first',
      ['2020 – 2022', 'Engineer at Acme, Berlin', '2018 – 2020', 'Developer at Beta, Pisa']
    ]
  ])('%s', (_, roles) => {
    const cv = AtsTextParser.parse(
      [
        'Giovanni Rossi',
        'rossi@example.com',
        '',
        'Professional Experience',
        ...roles,
        'Education',
        'B.Sc.',
        'X · 2015'
      ].join('\n')
    );

    expect(cv.experience.map((role) => [role.employer.value, role.period.raw])).toEqual([
      ['Acme', '2020 – 2022'],
      ['Beta', '2018 – 2020']
    ]);
  });

  test('German writes the header with "bei"', () => {
    const cv = AtsTextParser.parse(
      [
        'Giovanni Rossi',
        '',
        'Berufserfahrung',
        'Entwickler bei Acme, Berlin',
        'seit August 2018',
        '',
        'Ausbildung',
        'B.Sc.',
        'X · 2015'
      ].join('\n')
    );

    expect(identityOf(cv.experience[0])).toEqual(['Entwickler', 'Acme', 'Berlin']);
  });
});

// #230 asked for a role's metadata on two lines — the title, then "employer · place · dates" — and it waited, because
// no shape here read that second line: the role was lost with its period (#240). The parser reads it first, so the
// print can follow in a change of its own.
describe('a title over its employer, place and period on one line', () => {
  const cv = (lines) =>
    AtsTextParser.parse(
      [
        'Giovanni Rossi',
        'rossi@example.com',
        '',
        'Professional Experience',
        ...lines,
        '',
        'Education',
        'B.Sc.',
        'X · 2015'
      ].join('\n')
    );

  test('reads each role whole: title, employer, place and period', () => {
    const { experience } = cv([
      'Senior iOS Developer',
      'Acme Mobile GmbH · Berlin (remote) · August 2018 – November 2026',
      'Built the MDM client.',
      '',
      'Mobile Developer',
      'Beta Apps · Pisa, Italy · September 2015 – July 2018',
      'Shipped the offline mode.'
    ]);

    expect(experience.map((role) => [...identityOf(role), role.period.raw])).toEqual([
      [
        'Senior iOS Developer',
        'Acme Mobile GmbH',
        'Berlin (remote)',
        'August 2018 – November 2026'
      ],
      ['Mobile Developer', 'Beta Apps', 'Pisa, Italy', 'September 2015 – July 2018']
    ]);
    expect(experience.map((role) => role.tripleAdjacent)).toEqual([true, true]);
    expect(experience.map((role) => role.bodyText)).toEqual([
      'Built the MDM client.',
      'Shipped the offline mode.'
    ]);
  });

  test('reads a role still running, and one with no place', () => {
    const { experience } = cv([
      'iOS Developer',
      'Acme Mobile GmbH · August 2018 – present',
      'Built the MDM client.'
    ]);

    expect(identityOf(experience[0]).slice(0, 2)).toEqual(['iOS Developer', 'Acme Mobile GmbH']);
    expect(experience[0].location).toBeNull();
    expect(experience[0].period.raw).toBe('August 2018 – present');
  });

  // The review of #358: an achievement that closes on a date after a separator became a role, and took the next line
  // of the real role's body. The shape is the title opening its paragraph, then the employer's line.
  test.each([
    'Shipped v2 · May 2021',
    'Released v3 · 03/2021',
    'Mentored 3 juniors · since 2022',
    'Mentorte Junior-Entwickler · seit 2020',
    'Led the migration · 2019 – 2021'
  ])('an achievement closing on "%s" is no role', (achievement) => {
    const { experience } = cv([
      'iOS Developer at Acme, Berlin',
      'August 2018 – November 2026',
      achievement,
      'Cut the test suite in half.'
    ]);

    expect(experience).toHaveLength(1);
    expect(experience[0].bodyLines).toEqual([achievement, 'Cut the test suite in half.']);
  });

  test('a line above the section’s first role does not turn the section around', () => {
    const { experience } = cv([
      'Gave a talk · May 2021',
      'Senior iOS Developer at Acme, Berlin',
      'August 2018 – November 2026',
      'Built the MDM client.'
    ]);

    expect(experience.map(identityOf)).toContainEqual(['Senior iOS Developer', 'Acme', 'Berlin']);
  });

  // Poppler sets no blank line between one role's last achievement and the next role's title: the roles stand 9pt
  // apart on the paper, which it reads as one paragraph. A short title after a line that ends a sentence opens a role
  // as a title opening its paragraph does (the print of #240).
  test('reads a role whose title follows the last achievement of the role before, with no blank line', () => {
    const { experience } = cv([
      'iOS Developer',
      'Acme Mobile GmbH · Berlin (remote) · August 2018 – November 2026',
      'Built the MDM client.',
      'Google Play releases.',
      'Mobile Developer',
      'Beta Apps · Pisa, Italy · September 2015 – July 2018 (2 years, 11 months)',
      'Shipped the offline mode.'
    ]);

    expect(experience.map((role) => [...identityOf(role), role.period.raw])).toEqual([
      ['iOS Developer', 'Acme Mobile GmbH', 'Berlin (remote)', 'August 2018 – November 2026'],
      [
        'Mobile Developer',
        'Beta Apps',
        'Pisa, Italy',
        'September 2015 – July 2018 (2 years, 11 months)'
      ]
    ]);
    expect(experience[0].bodyLines).toEqual(['Built the MDM client.', 'Google Play releases.']);
  });

  // A line after a sentence opens a role only as a title does: short. An achievement written without its full stop,
  // under one written with it, stays an achievement.
  test('an achievement after a sentence is no title', () => {
    const { experience } = cv([
      'iOS Developer at Acme, Berlin',
      'August 2018 – November 2026',
      'Shipped the offline mode.',
      'Led the migration of the whole iOS client to SwiftUI across three teams',
      'Beta Apps · Pisa, Italy · 2019 – 2021'
    ]);

    expect(experience).toHaveLength(1);
  });

  test("a role's last achievement is never the next role's title", () => {
    const { experience } = cv([
      'Mobile Developer at Beta Apps, Pisa',
      'September 2015 – July 2018',
      'Shipped the offline mode.',
      'Cut crash rate in half.',
      'Acme Mobile GmbH · Berlin (remote) · August 2018 – November 2026',
      'Built the MDM client.'
    ]);

    expect(experience.map((role) => role.title?.value)).not.toContain('Cut crash rate in half.');
    expect(experience[0].bodyLines).toContain('Cut crash rate in half.');
  });

  // An achievement that closes on a year after a separator is not a role: a single year states when, not how long.
  test('an achievement closing on a year is no role', () => {
    const { experience } = cv([
      'iOS Developer at Acme, Berlin',
      'August 2018 – November 2026',
      'Released the tablet app · 2021',
      'Cut the test suite · 2019'
    ]);

    expect(experience).toHaveLength(1);
    expect(experience[0].bodyLines).toEqual([
      'Released the tablet app · 2021',
      'Cut the test suite · 2019'
    ]);
  });
});

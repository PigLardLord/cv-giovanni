import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CLOSING_MARKS, SwiftSourceLayout } from '../adapters/SwiftSourceLayout.js';
import { composingTheModel } from './support/model.js';

const labels = {
  'source.marks.profile': 'Profile',
  'source.marks.contact': 'Contact',
  'source.card.call': 'call',
  'source.card.mail': 'mail',
  'source.card.callName': 'Call {{value}}',
  'source.card.callJoke': 'Dial it on your own phone, lazybones.',
  'source.card.callDismiss': 'OK',
  'source.card.mailName': 'Email {{value}}',
  'source.card.location': 'Location',
  'cv:contacts.phone': 'Phone',
  'cv:contacts.email': 'Email',
  'cv:sections.skills': 'Core Technologies',
  'cv:sections.experience': 'Professional Experience',
  'cv:sections.certifications': 'Certifications',
  'cv:sections.education': 'Education',
  'cv:sections.languages': 'Languages',
  'cv:sections.interests': 'Interests',
  'cv:education.credits': '{{count}} ECTS'
};
const t = (key, options = {}) =>
  (labels[key] ?? key)
    .replace('{{value}}', options.value ?? '')
    .replace('{{count}}', options.count ?? '');

const profile = {
  name: 'Ada Lovelace',
  title: 'Senior iOS Engineer',
  subtitle: 'Swift · SwiftUI',
  profile: 'Engineer with eleven years in native mobile.',
  career_highlights: ['Owned the iOS client for 6 years', '75% faster CI, 4,800 tests'],
  availability: 'EU citizen',
  location: 'Berlin, Germany',
  email: 'ada@example.com',
  phone: '+49 30 1234',
  social: [{ platform: 'GitHub', url: 'https://github.com/ada/' }],
  skills: [
    { category: 'iOS', items: [{ name: 'Swift' }, { name: 'SwiftUI' }] },
    { category: 'Delivery & platform', items: [{ name: 'Fastlane' }] }
  ],
  relevant_experience: [
    {
      title: 'Mobile Engineer',
      company: 'Acme',
      location: 'Berlin (remote)',
      period: 'August 2018 – Present',
      summary: 'Enterprise mobility.',
      highlights: ['Cut CI time by 75%.', 'Owned the iOS client.']
    },
    {
      title: 'Intern',
      company: 'Marte 5',
      location: 'Livorno',
      period: '2015',
      summary: 'Built AR apps.',
      highlights: []
    }
  ],
  certifications: [
    {
      name: 'iOS Lead Essentials',
      issuer: 'Essential Developer',
      year: 2024,
      url: 'https://example.com/cert',
      description: 'Clean Architecture.'
    }
  ],
  education: [
    {
      degree: 'B.Sc. Computer Engineering',
      school: 'Università di Catania',
      period: '2009',
      credits: 180
    }
  ],
  languages: [
    { name: 'Italian', level: 'Native' },
    { name: 'English', level: 'C1 — professional' }
  ],
  interests: ['Robotics & IoT', 'Hiking']
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const published = JSON.parse(
  fs.readFileSync(path.join(root, 'profiles', 'general', 'en.json'), 'utf8')
);

/** What a token shows: its syntax, or its text with any escape drawn inside it and nothing kept out of sight. */
const shown = (token) =>
  token.code ??
  (token.parts
    ? token.parts
        .filter((part) => !part.unseen)
        .map((part) => part.code ?? part.text)
        .join('')
    : token.text);

/** The file as a person reading the editor sees it: syntax and content, four spaces a level. */
const sourceOf = ({ lines }) =>
  lines
    .map((line) =>
      line.tokens.length === 0 ? '' : '    '.repeat(line.depth) + line.tokens.map(shown).join('')
    )
    .join('\n');

/**
 * Where a Swift file's string literals do not close where they should: a quote that ends one early, a line that
 * ends inside one, a multi-line string whose delimiter shares its line with text. Read the way Swift reads them: a backslash escapes the next character, `"""` opens and closes
 * a multi-line string, and `//` starts a comment outside one.
 * @param {string} source - A Swift file
 * @returns {string[]} Each line number where a literal is left open, or a quote closes one and more text follows
 */
const openLiterals = (source) => {
  const problems = [];
  let multiline = false;
  source.split('\n').forEach((line, index) => {
    let inString = false;
    let closedAt = -1;
    for (let at = 0; at < line.length; at += 1) {
      const char = line[at];
      if (multiline || inString) {
        if (char === '\\') at += 1;
        else if (multiline && line.startsWith('"""', at)) {
          // Swift closes a multi-line string only on a line of its own: a delimiter after text on the line is a
          // run of quotes left unescaped.
          if (line.slice(0, at).trim() !== '') {
            problems.push(`line ${index + 1}: a multi-line string closes after text`);
          }
          multiline = false;
          at += 2;
        } else if (inString && char === '"') {
          inString = false;
          closedAt = at;
        }
      } else if (line.startsWith('//', at)) break;
      else if (line.startsWith('"""', at)) {
        if (line.slice(at + 3).trim() !== '') {
          problems.push(`line ${index + 1}: text follows an opening delimiter`);
        }
        multiline = true;
        at += 2;
      } else if (char === '"') {
        // A literal that closed must be followed by syntax, never by more words.
        if (closedAt === at - 1) problems.push(`line ${index + 1}: two literals meet`);
        inString = true;
      } else if (closedAt >= 0 && /[\p{L}\p{N}]/u.test(char) && closedAt === at - 1) {
        problems.push(`line ${index + 1}: a word follows a closed literal`);
      }
    }
    if (inString) problems.push(`line ${index + 1}: a literal is left open`);
  });
  if (multiline) problems.push('the file ends inside a multi-line string');
  return problems;
};

/** What a selection of a line copies: its real text, with everything the stylesheet draws gone. */
const textOf = (line) =>
  line.tokens
    .filter((token) => 'text' in token)
    .map((token) => token.text)
    .join('');

const textLinesOf = ({ lines }) => lines.map(textOf).filter(Boolean);

describe('SwiftSourceLayout', () => {
  const layout = composingTheModel(new SwiftSourceLayout());

  test('reads the CV as a Swift file: who, the profile, the evidence, then how to reach them', () => {
    expect(sourceOf(layout.compose(profile, { t }))).toBe(
      [
        '//  AdaLovelace.swift',
        '',
        'import SwiftUI',
        '',
        'struct AdaLovelace: Engineer {',
        '    let name = "Ada Lovelace"',
        '    let title = "Senior iOS Engineer"',
        '',
        '    // MARK: - Profile',
        '',
        '    let focus = "Swift · SwiftUI"',
        '    let summary = """',
        '        Engineer with eleven years in native mobile.',
        '        """',
        '    let impact: [String] = [',
        '        "Owned the iOS client for 6 years",',
        '        "75% faster CI, 4,800 tests",',
        '    ]',
        '    let availability = "EU citizen"',
        '',
        '    // MARK: - Professional Experience',
        '',
        '    let experience: [Role] = [',
        '        Role(',
        '            title: "Mobile Engineer",',
        '            company: "Acme",',
        '            location: "Berlin (remote)",',
        '            period: "August 2018 – Present",',
        '            summary: "Enterprise mobility."',
        '        ) {',
        '            "Cut CI time by 75%."',
        '            "Owned the iOS client."',
        '        },',
        '        Role(',
        '            title: "Intern",',
        '            company: "Marte 5",',
        '            location: "Livorno",',
        '            period: "2015",',
        '            summary: "Built AR apps."',
        '        ),',
        '    ]',
        '',
        '    // MARK: - Core Technologies',
        '',
        '    var skills: some SkillSet {',
        '        Category("iOS") {',
        '            ["Swift", "SwiftUI"]',
        '        }',
        '        Category("Delivery & platform") {',
        '            ["Fastlane"]',
        '        }',
        '    }',
        '',
        '    // MARK: - Certifications',
        '',
        '    let certifications: [Certification] = [',
        '        Certification(',
        '            name: "iOS Lead Essentials",',
        '            issuer: "Essential Developer",',
        '            year: 2024,',
        '            description: "Clean Architecture."',
        '        ),',
        '    ]',
        '',
        '    // MARK: - Education',
        '',
        '    let education: [Degree] = [',
        '        Degree(',
        '            title: "B.Sc. Computer Engineering",',
        '            school: "Università di Catania",',
        '            period: "2009",',
        '            credits: "180 ECTS"',
        '        ),',
        '    ]',
        '',
        '    // MARK: - Languages',
        '',
        '    let languages: KeyValuePairs<String, String> = [',
        '        "Italian": "Native",',
        '        "English": "C1 — professional",',
        '    ]',
        '',
        '    // MARK: - Interests',
        '',
        '    let interests: [String] = ["Robotics & IoT", "Hiking"]',
        '',
        '    // MARK: - Contact',
        '',
        '    let contact = Contact(',
        '        location: "Berlin, Germany",',
        '        email: "ada@example.com",',
        '        phone: "+49 30 1234",',
        '        links: [',
        '            Link("GitHub", destination: "github.com/ada"),',
        '        ]',
        '    )',
        '}',
        '',
        '#Preview {',
        '    ContactCard(for: AdaLovelace())',
        '        .preferredColorScheme(.dark)',
        '}'
      ].join('\n')
    );
  });

  test('copies line by line the way a reader reads it', () => {
    // The quotes, brackets and labels are drawn; what separates two words on one line is not.
    // A selection of the skills reads "Swift, SwiftUI", never "SwiftSwiftUI" — the product review
    // measured the second in Chrome, and a list of words could not have caught it.
    expect(textLinesOf(layout.compose(profile, { t }))).toEqual([
      'Ada Lovelace',
      'Senior iOS Engineer',
      'Profile',
      'Swift · SwiftUI',
      'Engineer with eleven years in native mobile.',
      'Owned the iOS client for 6 years',
      '75% faster CI, 4,800 tests',
      'EU citizen',
      'Professional Experience',
      'Mobile Engineer',
      'Acme',
      'Berlin (remote)',
      'August 2018 – Present',
      'Enterprise mobility.',
      'Cut CI time by 75%.',
      'Owned the iOS client.',
      'Intern',
      'Marte 5',
      'Livorno',
      '2015',
      'Built AR apps.',
      'Core Technologies',
      'iOS',
      'Swift, SwiftUI',
      'Delivery & platform',
      'Fastlane',
      'Certifications',
      'iOS Lead Essentials',
      'Essential Developer',
      '2024',
      'Clean Architecture.',
      'Education',
      'B.Sc. Computer Engineering',
      'Università di Catania',
      '2009',
      '180 ECTS',
      'Languages',
      'Italian: Native',
      'English: C1 — professional',
      'Interests',
      'Robotics & IoT, Hiking',
      'Contact',
      'Berlin, Germany',
      'ada@example.com',
      '+49 30 1234',
      'GitHub, github.com/ada'
    ]);
  });

  // A degree's scope carries its unit (#48). The argument label is drawn, so a number literal copied as a bare "60"
  // that says nothing of what it counts; the catalogue's words say it, in the CV's numbers.
  test('writes a degree’s credits as the CV writes them, so a reader copies "60 ECTS"', () => {
    const copied = textLinesOf(layout.compose(published, { t }));

    expect(copied).toContain('60 ECTS');
    expect(copied).not.toContain('60');
    expect(
      textLinesOf(
        layout.compose(
          { ...profile, education: [{ ...profile.education[0], credits: 1500 }] },
          {
            t,
            locale: 'de'
          }
        )
      )
    ).toContain('1.500 ECTS');
  });

  test('never lets two words on one line meet without real text between them', () => {
    const glued = layout.compose(published, { t }).lines.flatMap((line) => {
      const words = line.tokens.filter((token) => 'text' in token);
      return words
        .slice(1)
        .filter((token, index) => token.kind !== 'plain' && words[index].kind !== 'plain')
        .map((token, index) => `${words[index].text}|${token.text}`);
    });

    expect(glued).toEqual([]);
  });

  test('opens on the name: the first heading is the h1, on the line the editor opens on', () => {
    const { lines } = layout.compose(profile, { t });
    const headings = lines.flatMap((line) => [
      ...(line.heading ? [`h${line.heading}`] : []),
      ...line.tokens.filter((token) => /^h\d$/.test(token.element)).map((token) => token.element)
    ]);

    expect(headings[0]).toBe('h1');
    expect(lines.filter((line) => line.current).map((line) => sourceOf({ lines: [line] }))).toEqual(
      ['    let name = "Ada Lovelace"']
    );
  });

  test('gives the file a document outline: one heading per section, one per role', () => {
    const { lines } = layout.compose(profile, { t });
    const tokens = lines.flatMap((line) => line.tokens);

    expect(
      lines.filter((line) => line.heading === 2).map((line) => [line.id, line.tokens.at(-1).text])
    ).toEqual([
      ['source-profile', 'Profile'],
      ['source-experience', 'Professional Experience'],
      ['source-skills', 'Core Technologies'],
      ['source-certifications', 'Certifications'],
      ['source-education', 'Education'],
      ['source-languages', 'Languages'],
      ['source-interests', 'Interests'],
      ['source-contact', 'Contact']
    ]);
    expect(tokens.filter((token) => token.element === 'h3').map((token) => token.text)).toEqual([
      'Mobile Engineer',
      'Intern'
    ]);
  });

  test('colours a call apart from a type and an argument label apart from punctuation', () => {
    const tokens = layout.compose(profile, { t }).lines.flatMap((line) => line.tokens);
    const kindOf = (code) => tokens.find((token) => token.code === code)?.kind;

    expect(kindOf('Category')).toBe('call');
    expect(kindOf('Engineer')).toBe('type');
    expect(kindOf('KeyValuePairs')).toBe('type');
    expect(kindOf('title: ')).toBe('label');
    expect(kindOf('destination: ')).toBe('label');
    expect(kindOf('some ')).toBe('keyword');
    expect(kindOf('preferredColorScheme')).toBe('call');
    expect(kindOf('dark')).toBe('property');
  });

  test('lists the sections it wrote, in order, for the navigator', () => {
    expect(layout.compose(profile, { t }).outline).toEqual([
      { id: 'source-profile', label: 'Profile' },
      { id: 'source-experience', label: 'Professional Experience' },
      { id: 'source-skills', label: 'Core Technologies' },
      { id: 'source-certifications', label: 'Certifications' },
      { id: 'source-education', label: 'Education' },
      { id: 'source-languages', label: 'Languages' },
      { id: 'source-interests', label: 'Interests' },
      { id: 'source-contact', label: 'Contact' }
    ]);
  });

  test('makes every address a link a reader can use: the certificate, mail, phone and profiles', () => {
    const tokens = layout.compose(profile, { t }).lines.flatMap((line) => line.tokens);

    expect(
      tokens.filter((token) => token.element === 'a').map((token) => [token.text, token.href])
    ).toEqual([
      ['iOS Lead Essentials', 'https://example.com/cert'],
      ['ada@example.com', 'mailto:ada@example.com'],
      ['+49 30 1234', 'tel:+49301234'],
      ['github.com/ada', 'https://github.com/ada/']
    ]);
  });

  test('leaves out a section with nothing in it, heading and outline entry included', () => {
    const sparse = {
      ...profile,
      career_highlights: [],
      certifications: [],
      interests: [],
      social: [],
      subtitle: ''
    };
    const source = layout.compose(sparse, { t });

    expect(sourceOf(source)).not.toMatch(/Certifications|interests|links|focus|impact/);
    expect(source.outline.map((entry) => entry.id)).toEqual([
      'source-profile',
      'source-experience',
      'source-skills',
      'source-education',
      'source-languages',
      'source-contact'
    ]);
  });

  test('composes the contact card the #Preview renders, with actions that go somewhere', () => {
    // "call" is the page's one easter egg, asked for by the candidate: it opens an alert telling
    // the reader to dial the number themselves. The number stays a tel: link in the file and in
    // the card's details.
    expect(layout.compose(profile, { t }).card).toEqual({
      name: 'Ada Lovelace',
      title: 'Senior iOS Engineer',
      call: {
        title: '+49 30 1234',
        message: 'Dial it on your own phone, lazybones.',
        dismiss: 'OK'
      },
      actions: [
        { icon: 'phone', label: 'call', name: 'Call +49 30 1234', dialog: 'call' },
        {
          icon: 'mail',
          label: 'mail',
          name: 'Email ada@example.com',
          href: 'mailto:ada@example.com'
        },
        { icon: 'link', label: 'GitHub', name: 'GitHub', href: 'https://github.com/ada/' }
      ],
      rows: [
        { kind: 'phone', label: 'Phone', value: '+49 30 1234', href: 'tel:+49301234' },
        {
          kind: 'email',
          label: 'Email',
          value: 'ada@example.com',
          href: 'mailto:ada@example.com'
        },
        { kind: 'location', label: 'Location', value: 'Berlin, Germany' }
      ]
    });
  });

  test('keeps the card to what the profile has, and to one row of four actions', () => {
    // A phone screen has room for four buttons across; a fifth would wrap and read as a second
    // toolbar. So the links fill whatever the call and the mail leave.
    const social = [
      { platform: 'GitHub', url: 'https://github.com/ada' },
      { platform: 'LinkedIn', url: 'https://linkedin.com/in/ada' },
      { platform: 'Web CV', url: 'https://ada.example.com' }
    ];
    const full = layout.compose({ ...profile, social }, { t }).card;
    const bare = layout.compose({ ...profile, phone: '', location: '', social }, { t }).card;
    const labelsOf = (card) => card.actions.map((action) => action.label);

    expect(labelsOf(full)).toEqual(['call', 'mail', 'GitHub', 'LinkedIn']);
    expect(labelsOf(bare)).toEqual(['mail', 'GitHub', 'LinkedIn', 'Web CV']);
    expect(bare.rows.map((row) => row.kind)).toEqual(['email']);
    expect(bare.call).toBeNull();
  });

  test('names the type after the candidate, as a Swift identifier', () => {
    const typeOf = (name) => layout.compose({ ...profile, name }, { t }).typeName;

    expect(typeOf('Anna-Lena O’Brien')).toBe('AnnaLenaOBrien');
    expect(typeOf('José Núñez')).toBe('JoséNúñez');
    expect(typeOf('')).toBe('Curriculum');
  });

  // A highlight written 'Cut costs by using "smart" caching' closed its literal at the second quote, and the file was
  // not Swift (#160). The profile is edited in the browser and tailored by a model, so such values are plausible.
  describe('a value holding what Swift escapes', () => {
    const awkward = {
      ...profile,
      profile:
        'Ships "fast" \\ safely.\nWrites """ in docs.\nFour """" and five """"" and two "" quotes.',
      career_highlights: ['Cut costs by using "smart" caching', 'Paths like C:\\Build\\iOS'],
      languages: [{ name: 'C++ "expert"', level: 'Line one\nline two\ttabbed' }],
      interests: ['Robotics\nIoT', 'Quotes "and" \\ slashes', 'Carriage\rreturn']
    };

    test('the check finds a literal a quote closes early, and one a line break leaves open', () => {
      expect(openLiterals('let impact = ["Cut costs by "smart" caching"]')).not.toEqual([]);
      expect(openLiterals('let level = "Line one\nline two"')).not.toEqual([]);
      expect(openLiterals('let summary = """\n    One """ two\n    """')).not.toEqual([]);
      // Escaping only a run's first quote leaves a delimiter behind (the code review of #165), and two such runs on
      // one line close and reopen the string, which only the delimiter's own line gives away.
      expect(openLiterals('let summary = """\n    Four \\"""" end\n    """')).not.toEqual([]);
      expect(
        openLiterals('let summary = """\n    Four \\"""" and five \\""""" quotes.\n    """')
      ).not.toEqual([]);
      expect(openLiterals('let a = "b \\"c\\" d" // "e')).toEqual([]);
    });

    test('writes each literal the way Swift escapes it, so every one closes where it should', () => {
      const source = sourceOf(layout.compose(awkward, { t }));

      expect(openLiterals(source)).toEqual([]);
      expect(source).toContain('        "Cut costs by using \\"smart\\" caching",');
      expect(source).toContain('        "Paths like C:\\\\Build\\\\iOS",');
      expect(source).toContain('        "C++ \\"expert\\"": "Line one\\nline two\\ttabbed",');
      expect(source).toContain(
        '    let interests: [String] = ["Robotics\\nIoT", "Quotes \\"and\\" \\\\ slashes", "Carriage\\rreturn"]'
      );
    });

    // A multi-line string keeps its line breaks and its quotes; only a backslash and every quote of a run of three or
    // more are escaped.
    test('keeps the summary a multi-line string, a line of the file for each of its lines', () => {
      expect(sourceOf(layout.compose(awkward, { t }))).toContain(
        [
          '    let summary = """',
          '        Ships "fast" \\\\ safely.',
          '        Writes \\"\\"\\" in docs.',
          '        Four \\"\\"\\"\\" and five \\"\\"\\"\\"\\" and two "" quotes.',
          '        """'
        ].join('\n')
      );
    });

    test('copies every value as the profile writes it: no escape reaches a selection', () => {
      const copied = textLinesOf(layout.compose(awkward, { t }));

      expect(copied).toEqual(
        expect.arrayContaining([
          'Ships "fast" \\ safely.',
          'Writes """ in docs.',
          'Four """" and five """"" and two "" quotes.',
          'Cut costs by using "smart" caching',
          'Paths like C:\\Build\\iOS',
          'C++ "expert": Line one\nline two\ttabbed',
          'Robotics\nIoT, Quotes "and" \\ slashes, Carriage\rreturn'
        ])
      );
    });
  });

  test('reads a legacy flat skill list as a plain array', () => {
    const flat = { ...profile, skills: [{ name: 'Swift' }, { name: 'Git' }] };

    expect(sourceOf(layout.compose(flat, { t }))).toContain(
      '    let skills: [String] = ["Swift", "Git"]'
    );
  });
});

// A role's length follows its period, counted to the month the profile is written as of. A period written to
// the year has no length to give (#55).
test('gives a role its length after its period', () => {
  const source = sourceOf(
    composingTheModel(new SwiftSourceLayout()).compose({ ...profile, asOf: '2026-09' }, { t })
  );

  expect(source).toContain(
    '            period: "August 2018 – Present",\n            duration: "8 years, 2 months",'
  );
  expect(source).toContain('            period: "2015",\n            summary: "Built AR apps."');
});

// A narrow editor wrapped a role's dates as "August 2018 –" / "Present" at 320px (#180). A period is whole, which the
// renderer holds at each end, and nothing else is.
test('marks every period whole, and nothing else', () => {
  const tokens = composingTheModel(new SwiftSourceLayout())
    .compose({ ...profile, asOf: '2026-09' }, { t })
    .lines.flatMap((line) => line.tokens);

  expect(tokens.filter((token) => token.whole).map((token) => token.text)).toEqual([
    'August 2018 – Present',
    '2015',
    '2009'
  ]);
});

// A row of the editor opened with a lone `",` at 320px (#219). The syntax that closes a literal is marked, and the
// renderer holds it to the literal's last word; a quote that opens a literal, and a bracket that closes a type, are
// not marked.
test('marks the syntax that closes a literal, and nothing else', () => {
  const { lines } = composingTheModel(new SwiftSourceLayout()).compose(
    { ...profile, asOf: '2026-09' },
    { t }
  );
  const held = lines.flatMap(({ tokens }) =>
    tokens.flatMap((token, index) => {
      if (!('text' in token) || !tokens[index + 1]?.closes) return [];
      let next = index + 1;
      const closing = [];
      while (tokens[next]?.closes) closing.push(tokens[next++].code);
      return [
        { kind: token.kind, shown: `${token.text}${closing.join('')}`, count: closing.length }
      ];
    })
  );
  const marked = lines.flatMap(({ tokens }) => tokens.filter((token) => token.closes));

  expect(held.map((literal) => literal.shown)).toEqual(
    expect.arrayContaining([
      'Ada Lovelace"',
      'Owned the iOS client for 6 years",',
      'Mobile Engineer",',
      'August 2018 – Present",',
      'Cut CI time by 75%."',
      'iOS") {',
      'Swift"',
      'SwiftUI"]',
      'Italian"',
      'Native",',
      '2024,',
      'github.com/ada"),'
    ])
  );
  expect(new Set(held.map((literal) => literal.kind))).toEqual(new Set(['string', 'number']));
  expect(marked.every((token) => 'code' in token && CLOSING_MARKS.includes(token.code[0]))).toBe(
    true
  );
  expect(marked).toHaveLength(held.reduce((sum, literal) => sum + literal.count, 0));
});

// The code review of #223: a highlight ending in a quote of its own left its escape, that quote and the closing quote a
// row of their own at 320px. The renderer held the text node the value ended in, and an escape had cut the value's last
// word into three nodes. The layout reads the value whole, before its escapes part it, and marks `held` the parts from
// where its last word begins, which the renderer holds with the syntax that closes the value.
describe('the parts of a value its closing syntax holds', () => {
  const tokensOf = (data = {}) =>
    composingTheModel(new SwiftSourceLayout())
      .compose({ ...profile, asOf: '2026-09', ...data }, { t })
      .lines.flatMap((line) => line.tokens);
  const partsOf = (tokens, text) => tokens.find((token) => token.text === text)?.parts;
  const role = (changes) => ({
    relevant_experience: [{ ...profile.relevant_experience[0], ...changes }]
  });

  test('are its last word, after its last space, slash or hyphen', () => {
    const tokens = tokensOf();

    expect(partsOf(tokens, 'Cut CI time by 75%.')).toEqual([
      { text: 'Cut CI time by ' },
      { text: '75%.', held: true }
    ]);
    expect(partsOf(tokens, 'github.com/ada')).toEqual([
      { text: 'github.com/' },
      { text: 'ada', held: true }
    ]);
    expect(partsOf(tokens, '2024')).toEqual([{ text: '2024', held: true }]);
    expect(partsOf(tokensOf(role({ company: 'Marte-5' })), 'Marte-5')).toEqual([
      { text: 'Marte-' },
      { text: '5', held: true }
    ]);
  });

  test('are its last word with every escape inside it, when the value ends in a character it escapes', () => {
    const value = 'Shipped the tool the team still calls "NightingaleMigrationToolX"';

    expect(partsOf(tokensOf(role({ highlights: [value] })), value)).toEqual([
      { text: 'Shipped the tool the team still calls ' },
      { code: '\\', held: true },
      { text: '"', held: true },
      { text: 'NightingaleMigrationToolX', held: true },
      { code: '\\', held: true },
      { text: '"', held: true }
    ]);
  });

  test('start after a line break the value writes, and keep it out of sight', () => {
    const tokens = tokensOf({ languages: [{ name: 'Italian', level: 'Native\nfluent' }] });

    expect(partsOf(tokens, 'Native\nfluent')).toEqual([
      { text: 'Native' },
      { code: '\\n' },
      { text: '\n', unseen: true },
      { text: 'fluent', held: true }
    ]);
  });

  // The page holds a separator to the words either side of it (#180): a last word never starts at its spaces.
  test('start after a separator and its spaces, and never between them and the word before', () => {
    const tokens = tokensOf({ subtitle: 'Swift · SwiftUI', title: 'iOS ·' });

    expect(partsOf(tokens, 'Swift · SwiftUI')).toEqual([
      { text: 'Swift · ' },
      { text: 'SwiftUI', held: true }
    ]);
    expect(partsOf(tokens, 'iOS ·')).toEqual([{ text: 'iOS ·', held: true }]);
  });

  // A period breaks after its dash and nowhere else (#180), and only where no row holds it with its quotes (#219).
  test('are the last end of a period, whose ends are each whole', () => {
    const tokens = tokensOf();

    expect(partsOf(tokens, 'August 2018 – Present')).toEqual([
      { text: 'August 2018 –', whole: true },
      { text: ' Present', whole: true, held: true }
    ]);
    expect(partsOf(tokens, '2015')).toEqual([{ text: '2015', whole: true, held: true }]);
  });

  test('are none in a value no syntax closes', () => {
    expect(partsOf(tokensOf(), 'Engineer with eleven years in native mobile.')).toBeUndefined();
  });
});

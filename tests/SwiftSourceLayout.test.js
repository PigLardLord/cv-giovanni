import { SwiftSourceLayout } from '../adapters/SwiftSourceLayout.js';

const labels = {
  'source.marks.profile': 'Profile',
  'source.marks.contact': 'Contact',
  'source.card.call': 'call',
  'source.card.mail': 'mail',
  'source.card.location': 'Location',
  'cv:contacts.phone': 'Phone',
  'cv:contacts.email': 'Email',
  'cv:sections.skills': 'Core Technologies',
  'cv:sections.experience': 'Professional Experience',
  'cv:sections.certifications': 'Certifications',
  'cv:sections.education': 'Education',
  'cv:sections.languages': 'Languages',
  'cv:sections.interests': 'Interests'
};
const t = (key) => labels[key] ?? key;

const profile = {
  name: 'Ada Lovelace',
  title: 'Senior iOS Engineer',
  subtitle: 'Swift · SwiftUI',
  profile: 'Engineer with eleven years in native mobile.',
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
    { degree: 'B.Sc. Computer Engineering', school: 'Università di Catania', period: '2009' }
  ],
  languages: [
    { name: 'Italian', level: 'Native' },
    { name: 'English', level: 'C1 — professional' }
  ],
  interests: ['Robotics & IoT', 'Hiking']
};

/** The file as a person reading the editor sees it: syntax and content, four spaces a level. */
const sourceOf = ({ lines }) =>
  lines
    .map((line) =>
      line.tokens.length === 0
        ? ''
        : '    '.repeat(line.depth) + line.tokens.map((token) => token.code ?? token.text).join('')
    )
    .join('\n');

/** What survives without the stylesheet: the tokens that carry real text. */
const contentOf = ({ lines }) =>
  lines.flatMap((line) =>
    line.tokens.filter((token) => 'text' in token).map((token) => token.text)
  );

describe('SwiftSourceLayout', () => {
  const layout = new SwiftSourceLayout();

  test('reads the CV as a Swift file, section by section, in the order the page renders it', () => {
    expect(sourceOf(layout.compose(profile, { t }))).toBe(
      [
        '//',
        '//  AdaLovelace.swift',
        '//  CV',
        '//',
        '',
        'import SwiftUI',
        '',
        'struct AdaLovelace: Engineer {',
        '    // MARK: - Profile',
        '',
        '    let name = "Ada Lovelace"',
        '    let title = "Senior iOS Engineer"',
        '    let focus = "Swift · SwiftUI"',
        '    let summary = """',
        '        Engineer with eleven years in native mobile.',
        '        """',
        '    let availability = "EU citizen"',
        '',
        '    // MARK: - Contact',
        '',
        '    let contact = Contact(',
        '        location: "Berlin, Germany",',
        '        email: "ada@example.com",',
        '        phone: "+49 30 1234",',
        '        links: [',
        '            Link("GitHub", url: "github.com/ada"),',
        '        ]',
        '    )',
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
        '            period: "2009"',
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
        '}',
        '',
        '#Preview {',
        '    ContactCard(for: AdaLovelace())',
        '        .preferredColorScheme(.dark)',
        '}'
      ].join('\n')
    );
  });

  test('keeps the syntax out of the text: what a reader copies is what the data wrote', () => {
    // Every keyword, quote, bracket and argument label is decoration the stylesheet draws; the
    // renderer never writes it into the document. So the real text of the file is the CV and
    // nothing else — a screen reader, a selection and a search all meet "Acme", not `company:`.
    expect(contentOf(layout.compose(profile, { t }))).toEqual([
      'Profile',
      'Ada Lovelace',
      'Senior iOS Engineer',
      'Swift · SwiftUI',
      'Engineer with eleven years in native mobile.',
      'EU citizen',
      'Contact',
      'Berlin, Germany',
      'ada@example.com',
      '+49 30 1234',
      'GitHub',
      'github.com/ada',
      'Core Technologies',
      'iOS',
      'Swift',
      'SwiftUI',
      'Delivery & platform',
      'Fastlane',
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
      'Certifications',
      'iOS Lead Essentials',
      'Essential Developer',
      '2024',
      'Clean Architecture.',
      'Education',
      'B.Sc. Computer Engineering',
      'Università di Catania',
      '2009',
      'Languages',
      'Italian',
      'Native',
      'English',
      'C1 — professional',
      'Interests',
      'Robotics & IoT',
      'Hiking'
    ]);
  });

  test('gives the file a document outline: the name, one heading per section, one per role', () => {
    const { lines } = layout.compose(profile, { t });
    const tokens = lines.flatMap((line) => line.tokens);

    expect(tokens.filter((token) => token.element === 'h1').map((token) => token.text)).toEqual([
      'Ada Lovelace'
    ]);
    expect(
      lines.filter((line) => line.heading === 2).map((line) => [line.id, line.tokens.at(-1).text])
    ).toEqual([
      ['source-profile', 'Profile'],
      ['source-contact', 'Contact'],
      ['source-skills', 'Core Technologies'],
      ['source-experience', 'Professional Experience'],
      ['source-certifications', 'Certifications'],
      ['source-education', 'Education'],
      ['source-languages', 'Languages'],
      ['source-interests', 'Interests']
    ]);
    expect(tokens.filter((token) => token.element === 'h3').map((token) => token.text)).toEqual([
      'Mobile Engineer',
      'Intern'
    ]);
  });

  test('marks the line the editor opens on', () => {
    const { lines } = layout.compose(profile, { t });

    expect(lines.filter((line) => line.current).map((line) => sourceOf({ lines: [line] }))).toEqual(
      ['    let name = "Ada Lovelace"']
    );
  });

  test('colours a call apart from a type and an argument label apart from punctuation', () => {
    const tokens = layout.compose(profile, { t }).lines.flatMap((line) => line.tokens);
    const kindOf = (code) => tokens.find((token) => token.code === code)?.kind;

    expect(kindOf('Category')).toBe('call');
    expect(kindOf('Engineer')).toBe('type');
    expect(kindOf('KeyValuePairs')).toBe('type');
    expect(kindOf('title: ')).toBe('label');
    expect(kindOf('some ')).toBe('keyword');
    expect(kindOf('preferredColorScheme')).toBe('call');
    expect(kindOf('dark')).toBe('property');
  });

  test('lists the sections it wrote, in order, for the navigator', () => {
    expect(layout.compose(profile, { t }).outline).toEqual([
      { id: 'source-profile', label: 'Profile' },
      { id: 'source-contact', label: 'Contact' },
      { id: 'source-skills', label: 'Core Technologies' },
      { id: 'source-experience', label: 'Professional Experience' },
      { id: 'source-certifications', label: 'Certifications' },
      { id: 'source-education', label: 'Education' },
      { id: 'source-languages', label: 'Languages' },
      { id: 'source-interests', label: 'Interests' }
    ]);
  });

  test('keeps the addresses followable', () => {
    const tokens = layout.compose(profile, { t }).lines.flatMap((line) => line.tokens);

    expect(
      tokens.filter((token) => token.element === 'a').map((token) => [token.text, token.href])
    ).toEqual([
      ['github.com/ada', 'https://github.com/ada/'],
      ['iOS Lead Essentials', 'https://example.com/cert']
    ]);
  });

  test('leaves out a section with nothing in it, heading and outline entry included', () => {
    const sparse = { ...profile, certifications: [], interests: [], social: [], subtitle: '' };
    const source = layout.compose(sparse, { t });

    expect(sourceOf(source)).not.toMatch(/Certifications|interests|links|focus/);
    expect(source.outline.map((entry) => entry.id)).toEqual([
      'source-profile',
      'source-contact',
      'source-skills',
      'source-experience',
      'source-education',
      'source-languages'
    ]);
  });

  test('composes the contact card the #Preview renders', () => {
    expect(layout.compose(profile, { t }).card).toEqual({
      name: 'Ada Lovelace',
      title: 'Senior iOS Engineer',
      actions: [
        { icon: 'phone', label: 'call' },
        { icon: 'mail', label: 'mail' },
        { icon: 'link', label: 'GitHub' }
      ],
      rows: [
        { kind: 'phone', label: 'Phone', value: '+49 30 1234' },
        { kind: 'email', label: 'Email', value: 'ada@example.com' },
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
  });

  test('names the type after the candidate, as a Swift identifier', () => {
    const typeOf = (name) => layout.compose({ ...profile, name }, { t }).typeName;

    expect(typeOf('Anna-Lena O’Brien')).toBe('AnnaLenaOBrien');
    expect(typeOf('José Núñez')).toBe('JoséNúñez');
    expect(typeOf('')).toBe('Curriculum');
  });

  test('reads a legacy flat skill list as a plain array', () => {
    const flat = { ...profile, skills: [{ name: 'Swift' }, { name: 'Git' }] };

    expect(sourceOf(layout.compose(flat, { t }))).toContain(
      '    let skills: [String] = ["Swift", "Git"]'
    );
  });
});

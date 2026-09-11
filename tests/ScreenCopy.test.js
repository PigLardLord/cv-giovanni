import { screenCopy } from '../scripts/lib/screen-copy.mjs';

const profile = {
  name: 'Giovanni Trovato',
  title: 'Senior iOS Engineer / Mobile Platform Owner',
  email: 'trovato.giovanni@gmail.com',
  location: 'Bad Liebenstein, Thuringia, Germany',
  social: [{ platform: 'GitHub', url: 'https://github.com/PigLardLord' }],
  relevant_experience: [{ company: 'Cortado Mobile Solutions' }],
  skills: [
    { category: 'iOS', items: [{ name: 'Swift' }, { name: 'SwiftUI' }, { name: 'UIKit' }] },
    { category: 'Android', items: [{ name: 'Kotlin' }, { name: 'Jetpack Compose' }] }
  ],
  languages: [
    { name: 'Italian', level: 'Native' },
    { name: 'German', level: 'A1 — currently studying' }
  ],
  interests: ['iOS Architecture', 'Mountain Hiking']
};
const options = { skillsLabel: 'Core Technologies' };
const copy = (...lines) => lines.join('\n');

// What Chrome copied off Nerd Mode's editor on main, cut down to the lines these checks read.
const nerd = [
  'Giovanni Trovato',
  'Senior iOS Engineer / Mobile Platform Owner',
  'Swift · SwiftUI · Enterprise Mobility · CI/CD',
  'Professional Experience',
  'Cortado Mobile Solutions',
  'Core Technologies',
  'iOS',
  'Swift, SwiftUI, UIKit',
  'Android',
  'Kotlin, Jetpack Compose',
  'Languages',
  'Italian: Native',
  'German: A1 — currently studying',
  'Interests',
  'iOS Architecture, Mountain Hiking',
  'Contact',
  'trovato.giovanni@gmail.com',
  'Bad Liebenstein, Thuringia, Germany',
  'GitHub, github.com/PigLardLord'
];

describe('what a reader copies when they select the CV', () => {
  test("Nerd Mode's copy, as it reads on main, passes every check", () => {
    expect(screenCopy(copy(...nerd), profile, options).checks).toEqual({
      captured: true,
      notWelded: true,
      skillsAttached: true,
      languagesLevelled: true,
      nothingUnwritten: true
    });
  });

  // Impact Spotlight and Technical Profile copy one skill and one interest to a line.
  test('one skill and one interest to a line passes too', () => {
    const spotlight = copy(
      ...nerd.slice(0, 7),
      'Swift',
      'SwiftUI',
      'UIKit',
      'Android',
      'Kotlin',
      'Jetpack Compose',
      ...nerd.slice(10, 14),
      'iOS Architecture',
      'Mountain Hiking',
      ...nerd.slice(15)
    );

    expect(Object.values(screenCopy(spotlight, profile, options).checks).every(Boolean)).toBe(true);
  });

  // Technical Profile sets its section labels in capitals, and Chrome copies them as it draws them.
  // The label still marks where the lists begin.
  test('a skills label the stylesheet sets in capitals still marks where the lists begin', () => {
    const shouted = copy(...nerd.slice(0, 5), 'CORE TECHNOLOGIES', ...nerd.slice(6));

    expect(screenCopy(shouted, profile, options).checks.skillsAttached).toBe(true);
  });

  // #56 shipped this: the separators were drawn by the stylesheet, so a selection lost them.
  test('names every pair of words a selection welded together', () => {
    const drawn = copy(
      ...nerd.slice(0, 7),
      'SwiftSwiftUIUIKit',
      'Android',
      'KotlinJetpack Compose',
      'Languages',
      'ItalianNative',
      'GermanA1 — currently studying',
      ...nerd.slice(13)
    );
    const { checks, findings } = screenCopy(drawn, profile, options);

    expect(checks.notWelded).toBe(false);
    expect(findings.welded).toEqual([
      'SwiftSwiftUI',
      'SwiftUIUIKit',
      'KotlinJetpack Compose',
      'ItalianNative',
      'GermanA1 — currently studying'
    ]);
  });

  // Found by hand on a branch where Impact Spotlight hid the line break between two contact details and
  // the whitespace beside it went too: the address ran straight into the next label.
  test('a contact detail that runs into the word beside it is welded', () => {
    const joined = copy(
      ...nerd.slice(0, 16),
      'trovato.giovanni@gmail.comPhone:',
      'Bad Liebenstein, Thuringia, GermanyGitHub, github.com/PigLardLord'
    );
    const { checks, findings } = screenCopy(joined, profile, options);

    expect(checks.notWelded).toBe(false);
    expect(findings.welded).toEqual([
      'Bad Liebenstein, Thuringia, GermanyGitHub',
      'trovato.giovanni@gmail.comPhone'
    ]);
  });

  test('a skill list that reaches the reader after another category is detached from its own', () => {
    const torn = copy(
      ...nerd.slice(0, 7),
      'Android',
      'Swift, SwiftUI, UIKit',
      'Kotlin, Jetpack Compose',
      ...nerd.slice(10)
    );
    const { checks, findings } = screenCopy(torn, profile, options);

    expect(checks.skillsAttached).toBe(false);
    expect(findings.detached).toEqual(['iOS']);
  });

  test('a language whose level lands on another line has lost it', () => {
    const split = copy(
      ...nerd.slice(0, 12),
      'German',
      'A1 — currently studying',
      ...nerd.slice(13)
    );
    const { checks, findings } = screenCopy(split, profile, options);

    expect(checks.languagesLevelled).toBe(false);
    expect(findings.unlevelled).toEqual(['German']);
  });

  // Impact Spotlight and Technical Profile on main: the location copies with the pin in front of it.
  test('a pictograph, or a line number the editor draws, is something the data did not write', () => {
    const decorated = copy(...nerd, '📍 Bad Liebenstein, Thuringia, Germany', '12');
    const { checks, findings } = screenCopy(decorated, profile, options);

    expect(checks.nothingUnwritten).toBe(false);
    expect(findings.unwritten).toEqual(['📍 Bad Liebenstein, Thuringia, Germany', '12']);
  });

  test('a year on a line of its own is data, not a line number', () => {
    expect(
      screenCopy(copy(...nerd, 'Google', '2026'), profile, options).checks.nothingUnwritten
    ).toBe(true);
  });

  // An empty selection, or one that caught the wrong element, must not score a clean pass.
  test('a selection that missed the CV fails, and says what it missed', () => {
    const { checks, findings } = screenCopy(
      copy('Download PDF', 'Browser print'),
      profile,
      options
    );

    expect(checks.captured).toBe(false);
    expect(findings.missing).toEqual([
      'Giovanni Trovato',
      'Senior iOS Engineer / Mobile Platform Owner',
      'trovato.giovanni@gmail.com',
      'Cortado Mobile Solutions'
    ]);
  });
});

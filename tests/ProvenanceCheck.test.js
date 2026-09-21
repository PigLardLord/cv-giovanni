/**
 * @jest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';
import { ProvenanceCheck } from '../core/ProvenanceCheck.js';

// A tailoring may choose, order, shorten and reword; it may not add (#260). This is the check that holds a tailored
// CV to the full CV it came from, item by item, before anything is built from it (#284).
const SOURCE = Object.freeze({
  name: 'Ada Lovelace',
  title: 'Senior iOS Engineer',
  email: 'ada@example.com',
  phone: '+44 20 7946 0000',
  location: 'London',
  profile:
    'Senior iOS engineer with 11+ years in native mobile development, 3 of them at Analytical Engines.',
  career_highlights: ['Engine Notes for iOS: ~30k downloads since 2021'],
  relevant_experience: [
    {
      title: 'iOS Developer',
      company: 'Analytical Engines',
      location: 'London (remote)',
      period: 'January 2021 – December 2023',
      summary: 'Owned the iOS client in a team of 2.',
      highlights: [
        'Engine Notes for iOS, built in SwiftUI from its first commit in 2021: Clean Architecture, TDD.',
        'Cut the test suite from 37.7 to 5.2 minutes.',
        'Shipped App Store releases every two weeks.'
      ]
    },
    {
      title: 'Mobile Developer',
      company: 'Difference Works',
      period: 'March 2015 – December 2020',
      highlights: ['Moved the app from Objective-C to Swift.']
    }
  ],
  education: [{ degree: 'B.Sc. Mathematics', school: 'University of London', period: '2010–2013' }],
  skills: [
    { category: 'iOS', items: [{ name: 'Swift' }, { name: 'SwiftUI' }, { name: 'Objective-C' }] },
    { category: 'Practices', items: [{ name: 'TDD' }, { name: 'CI/CD' }] }
  ],
  languages: [{ name: 'English', level: 'native' }],
  certifications: [{ name: 'Certified Engine Operator', issuer: 'Babbage Institute', year: 2020 }],
  interests: ['chess'],
  social: [{ platform: 'GitHub', url: 'https://github.com/ada' }]
});

/** Every item mapped to itself: the tailoring that changes nothing. */
const itself = (source) => {
  const sources = {};
  (source.career_highlights || []).forEach((_, index) => {
    sources[`career_highlights[${index}]`] = `career_highlights[${index}]`;
  });
  (source.relevant_experience || []).forEach((role, index) => {
    sources[`relevant_experience[${index}]`] = `relevant_experience[${index}]`;
    (role.highlights || []).forEach((_, at) => {
      sources[`relevant_experience[${index}].highlights[${at}]`] =
        `relevant_experience[${index}].highlights[${at}]`;
    });
  });
  return sources;
};

const check = (
  edit = () => {},
  { sources, terms = ['Kotlin', 'Jetpack Compose'], advert = '' } = {}
) => {
  const tailored = structuredClone(SOURCE);
  const mapped = sources ?? itself(SOURCE);
  edit(tailored, mapped);
  return ProvenanceCheck.failures({ source: SOURCE, tailored, sources: mapped, terms, advert });
};
const reasonsAt = (failures, path) =>
  failures.filter((failure) => failure.path === path).map(({ reason }) => reason);

describe('a tailoring that only subtracts, reorders and rewords', () => {
  test('the tailoring that changes nothing holds', () => {
    expect(check()).toEqual([]);
  });

  test('dropping a role, an achievement, a skill and a degree holds', () => {
    expect(
      check((cv, sources) => {
        cv.relevant_experience.pop();
        cv.relevant_experience[0].highlights.splice(2, 1);
        cv.skills[0].items.splice(2, 1);
        cv.education = [];
        delete sources['relevant_experience[1]'];
      })
    ).toEqual([]);
  });

  test('reordering achievements holds, each still naming its source', () => {
    expect(
      check((cv, sources) => {
        cv.relevant_experience[0].highlights.reverse();
        sources['relevant_experience[0].highlights[0]'] = 'relevant_experience[0].highlights[2]';
        sources['relevant_experience[0].highlights[2]'] = 'relevant_experience[0].highlights[0]';
      })
    ).toEqual([]);
  });

  test('rewording into the advert’s plain words holds, and so does merging two achievements of one role', () => {
    expect(
      check((cv, sources) => {
        cv.relevant_experience[0].highlights = [
          'Built Engine Notes for iOS in SwiftUI from 2021, with Clean Architecture and TDD, and cut its test suite from 37.7 to 5.2 minutes.'
        ];
        sources['relevant_experience[0].highlights[0]'] = [
          'relevant_experience[0].highlights[0]',
          'relevant_experience[0].highlights[1]'
        ];
        delete sources['relevant_experience[0].highlights[1]'];
        delete sources['relevant_experience[0].highlights[2]'];
      })
    ).toEqual([]);
  });

  test('an achievement may say its own role’s employer', () => {
    expect(
      check((cv) => {
        cv.relevant_experience[0].highlights[2] =
          'Shipped App Store releases of Analytical Engines’ app every two weeks.';
      })
    ).toEqual([]);
  });

  test('the title may be a role’s title', () => {
    expect(check((cv) => (cv.title = 'iOS Developer'))).toEqual([]);
  });
});

describe('a tailoring that adds', () => {
  test('a figure its source does not state', () => {
    const failures = check((cv) => {
      cv.relevant_experience[0].highlights[1] = 'Cut the test suite from 37.7 to 4 minutes.';
    });
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[1]')).toEqual([
      'states 4, which its source does not'
    ]);
  });

  test('a date its source does not state', () => {
    const failures = check((cv) => {
      cv.relevant_experience[0].highlights[2] =
        'Shipped App Store releases every two weeks since 2019.';
    });
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[2]')).toEqual([
      'states 2019, which its source does not'
    ]);
  });

  test('a technology its source does not name, capitalised or asked for by the advert', () => {
    const failures = check(
      (cv) => {
        cv.relevant_experience[0].highlights[0] =
          'Engine Notes for iOS, built in SwiftUI and Jetpack Compose from 2021, with kotlin on the side.';
      },
      { terms: ['kotlin', 'Jetpack Compose'] }
    );
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[0]')).toEqual([
      'names "Jetpack", which its source does not',
      'names "Compose", which its source does not',
      'says "kotlin", which its source does not'
    ]);
  });

  test('an employer from another role', () => {
    const failures = check((cv) => {
      cv.relevant_experience[0].highlights[1] =
        'Cut the test suite from 37.7 to 5.2 minutes, as at Difference Works.';
    });
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[1]')).toEqual([
      'names "Difference", which its source does not',
      'names "Works", which its source does not'
    ]);
  });

  test('a fact in the summary that the whole source does not state', () => {
    const failures = check((cv) => {
      cv.profile =
        'Senior iOS engineer with 15+ years, leading a team of 12 at Analytical Engines.';
    });
    expect(reasonsAt(failures, 'profile')).toEqual([
      'states 15, which its source does not',
      'states 12, which its source does not'
    ]);
  });

  test('a skill, a degree, a language level, a certification or an interest the source does not list', () => {
    const failures = check((cv) => {
      cv.skills[0].items.push({ name: 'Kotlin' });
      cv.education[0].degree = 'M.Sc. Mathematics';
      cv.languages[0].level = 'C2';
      cv.certifications[0].year = 2021;
      cv.interests.push('sailing');
    });
    expect(failures.map(({ path }) => path)).toEqual([
      'skills[0].items[3]',
      'education[0]',
      'certifications[0]',
      'languages[0]',
      'interests[1]'
    ]);
  });
});

describe('a tailoring that changes what it may only copy', () => {
  test.each([
    ['company', 'Analytical Engines Ltd'],
    ['title', 'Senior iOS Developer'],
    ['period', 'January 2021 – January 2024']
  ])('a role’s %s', (key, value) => {
    const failures = check((cv) => (cv.relevant_experience[0][key] = value));
    expect(failures).toEqual([
      { path: `relevant_experience[0].${key}`, reason: `is not relevant_experience[0]'s ${key}` }
    ]);
  });

  test.each([
    ['email', 'ada@elsewhere.com'],
    ['phone', undefined],
    ['location', 'Berlin'],
    ['name', 'Augusta Ada King']
  ])('the identity’s %s', (key, value) => {
    const failures = check((cv) => {
      if (value === undefined) delete cv[key];
      else cv[key] = value;
    });
    expect(failures).toEqual([{ path: key, reason: "is the source's identity, and changed" }]);
  });

  test('the links', () => {
    expect(check((cv) => (cv.social = []))).toEqual([
      { path: 'social', reason: "is the source's links, and changed" }
    ]);
  });

  test('a title that is neither the source’s nor a role’s', () => {
    expect(check((cv) => (cv.title = 'Staff iOS Engineer'))).toEqual([
      { path: 'title', reason: expect.stringMatching(/neither/) }
    ]);
  });
});

describe('what a tailoring must say about where each item came from', () => {
  test('a role or an achievement that names no source', () => {
    const failures = check((cv, sources) => {
      delete sources['relevant_experience[1]'];
      delete sources['relevant_experience[0].highlights[0]'];
    });
    expect(failures).toEqual([
      { path: 'relevant_experience[0].highlights[0]', reason: 'names no source item' },
      { path: 'relevant_experience[1]', reason: 'names no source item' }
    ]);
  });

  test('a source the full CV does not have', () => {
    const failures = check((cv, sources) => {
      sources['career_highlights[0]'] = 'career_highlights[7]';
    });
    expect(failures).toEqual([
      {
        path: 'career_highlights[0]',
        reason: 'names career_highlights[7], which the source does not have'
      }
    ]);
  });

  test('an achievement naming an achievement of another role', () => {
    const failures = check((cv, sources) => {
      sources['relevant_experience[0].highlights[0]'] = 'relevant_experience[1].highlights[0]';
    });
    expect(failures).toEqual([
      {
        path: 'relevant_experience[0].highlights[0]',
        reason:
          "names relevant_experience[1].highlights[0], which is not in its role's source, relevant_experience[0]"
      }
    ]);
  });

  test('a role naming something that is not a role, or more than one', () => {
    expect(
      check((cv, sources) => (sources['relevant_experience[1]'] = 'career_highlights[0]'))
    ).toEqual([
      {
        path: 'relevant_experience[1]',
        reason: 'names career_highlights[0] as its source, which is not a role'
      }
    ]);
    expect(
      check(
        (cv, sources) =>
          (sources['relevant_experience[1]'] = ['relevant_experience[1]', 'relevant_experience[0]'])
      )
    ).toEqual([{ path: 'relevant_experience[1]', reason: 'names more than one source role' }]);
  });
});

describe('what the whole profile must still be', () => {
  test('the profile’s shape', () => {
    expect(check((cv) => (cv.relevant_experience[0].period = 'three years'))).toEqual([
      expect.objectContaining({ path: 'relevant_experience[0].period' })
    ]);
  });

  test('free of spans the calendar will overtake (#274)', () => {
    const failures = check((cv) => {
      cv.relevant_experience[0].summary = 'Owned the iOS client for three years in a team of 2.';
    });
    // A figure in words the source does not state, and a span the calendar will overtake: two failures, one text.
    expect(failures).toEqual([
      { path: 'relevant_experience[0].summary', reason: 'states three, which its source does not' },
      expect.objectContaining({
        path: 'relevant_experience[0].summary',
        reason: expect.stringMatching(/^"three years": /)
      })
    ]);
  });
});

// What the review of #286 found passing, or refused, that should not have been. Each case is one it reproduced.
describe('what the review of the check found', () => {
  test('a decimal point dropped is another figure: 5.2 is not 52, and 37.7 is not 377', () => {
    for (const text of [
      'Cut the test suite from 37.7 to 52 minutes.',
      'Cut the test suite from 377 to 5.2 minutes.'
    ]) {
      const failures = check((cv) => (cv.relevant_experience[0].highlights[1] = text));
      expect(reasonsAt(failures, 'relevant_experience[0].highlights[1]')).toHaveLength(1);
    }
  });

  test('a comma for the decimal point, and a thousands separator, are the same figure', () => {
    expect(
      check(
        (cv) =>
          (cv.relevant_experience[0].highlights[1] = 'Cut the test suite from 37,7 to 5.2 minutes.')
      )
    ).toEqual([]);
  });

  test('a version a name carries states no figure: iOS17, v2.0', () => {
    const states = (text, against) =>
      ProvenanceCheck.additions(text, against).filter((reason) => reason.startsWith('states'));

    expect(states('Shipped for iOS17.', 'Shipped for iOS 17.')).toEqual([]);
    expect(states('Shipped v2.0.', 'Shipped v2.')).toEqual([]);
  });

  test('a figure in words is a figure', () => {
    const failures = check((cv) => {
      cv.profile =
        'Senior iOS engineer with 11+ years, leading a team of twelve at Analytical Engines.';
      cv.relevant_experience[0].highlights[2] =
        'Shipped App Store releases every two weeks across twenty-five screens.';
    });
    expect(reasonsAt(failures, 'profile')).toEqual(['states twelve, which its source does not']);
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[2]')).toEqual([
      'states twenty-five, which its source does not'
    ]);
  });

  test('a possessive and a compound of a name the source writes are that name', () => {
    for (const text of [
      'Engine Notes for iOS, built on SwiftUI’s declarative views from 2021.',
      "Engine Notes for iOS, built on SwiftUI's layout system from 2021.",
      'A SwiftUI-based Engine Notes for iOS, from 2021.',
      'TDD-driven Engine Notes for iOS in SwiftUI, from 2021.'
    ]) {
      expect(check((cv) => (cv.relevant_experience[0].highlights[0] = text))).toEqual([]);
    }
    expect(
      reasonsAt(
        check(
          (cv) =>
            (cv.relevant_experience[0].highlights[0] = 'A Kotlin-based Engine Notes, from 2021.')
        ),
        'relevant_experience[0].highlights[0]'
      )
    ).toEqual(['names "Kotlin-based", which its source does not']);
  });

  test('a name after a semicolon or a dash is a name, and one the advert writes is a name at a sentence’s start', () => {
    const failures = check(
      (cv) => {
        cv.relevant_experience[0].highlights[2] =
          'Shipped App Store releases every two weeks; Bitrise.';
        cv.relevant_experience[0].highlights[1] =
          'Fastlane cut the test suite from 37.7 to 5.2 minutes.';
      },
      { advert: 'Requirements:\n- Fastlane and Bitrise' }
    );
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[2]')).toEqual([
      'names "Bitrise", which its source does not'
    ]);
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[1]')).toEqual([
      'names "Fastlane", which its source does not'
    ]);
    // A plain word the advert opens a bullet with is no name.
    expect(
      check(
        (cv) =>
          (cv.relevant_experience[0].highlights[2] =
            'Across releases: shipped App Store releases every two weeks.'),
        { advert: 'Requirements:\n- Across teams, deliver features.' }
      )
    ).toEqual([]);
    // A verb at a sentence's start is a verb, whatever the advert writes.
    expect(
      check(
        (cv) =>
          (cv.relevant_experience[0].highlights[2] =
            'Delivered App Store releases every two weeks.'),
        {
          advert: 'Deliver features.'
        }
      )
    ).toEqual([]);
  });

  test('a word the advert writes and the source never does is held, in any case', () => {
    const failures = check(
      (cv) => {
        cv.relevant_experience[0].highlights[1] =
          'Cut the test suite from 37.7 to 5.2 minutes through test automation, with accessibility.';
      },
      {
        advert: 'Requirements:\n- kotlin multiplatform\n- test automation\n- accessibility',
        terms: []
      }
    );
    expect(reasonsAt(failures, 'relevant_experience[0].highlights[1]')).toEqual([
      'says "automation", which its source does not',
      'says "accessibility", which its source does not'
    ]);
  });

  test('an achievement comes from achievements: not a summary, a period or a whole list', () => {
    for (const named of [
      'relevant_experience[0].summary',
      'relevant_experience[0].period',
      'relevant_experience[0].highlights'
    ]) {
      const failures = check((cv, sources) => {
        sources['relevant_experience[0].highlights[0]'] = [named];
      });
      expect(failures).toEqual([
        {
          path: 'relevant_experience[0].highlights[0]',
          reason: `names ${named} as its source, which is not an achievement`
        }
      ]);
    }
  });

  test('a career highlight comes from an achievement or a highlight, not the summary', () => {
    expect(check((cv, sources) => (sources['career_highlights[0]'] = 'profile'))).toEqual([
      {
        path: 'career_highlights[0]',
        reason: 'names profile as its source, which is not an achievement or a highlight'
      }
    ]);
  });

  test('a path only walks the source’s own fields and indexes', () => {
    for (const named of ['__proto__', 'constructor', 'relevant_experience[0].highlights.length']) {
      const failures = check((cv, sources) => (sources['career_highlights[0]'] = named));
      expect(failures).toEqual([
        { path: 'career_highlights[0]', reason: `names ${named}, which the source does not have` }
      ]);
    }
  });

  test('one source role is named by one tailored role', () => {
    const failures = check((cv, sources) => {
      cv.relevant_experience[1] = structuredClone(cv.relevant_experience[0]);
      sources['relevant_experience[1]'] = 'relevant_experience[0]';
      sources['relevant_experience[1].highlights[0]'] = 'relevant_experience[0].highlights[0]';
      sources['relevant_experience[1].highlights[1]'] = 'relevant_experience[0].highlights[1]';
      sources['relevant_experience[1].highlights[2]'] = 'relevant_experience[0].highlights[2]';
    });
    expect(failures).toContainEqual({
      path: 'relevant_experience[1]',
      reason: 'names relevant_experience[0], which relevant_experience[0] already names'
    });
  });

  test('inside a role, its title goes without saying, as its employer does', () => {
    expect(
      check(
        (cv) =>
          (cv.relevant_experience[0].highlights[2] =
            'Shipped iOS releases to the App Store every two weeks.')
      )
    ).toEqual([]);
  });

  test('a role’s location, a skill category and the subtitle are held too', () => {
    const failures = check((cv) => {
      cv.relevant_experience[0].location = 'Berlin';
      cv.skills[0].category = 'iOS and Kotlin';
      cv.subtitle = 'Swift · Jetpack';
    });
    expect(failures).toEqual([
      { path: 'subtitle', reason: 'names "Jetpack", which its source does not' },
      {
        path: 'relevant_experience[0].location',
        reason: "is not relevant_experience[0]'s location"
      },
      { path: 'skills[0].category', reason: 'names "Kotlin", which its source does not' }
    ]);
  });

  test('a degree is the one the source lists whatever order its fields come in', () => {
    expect(
      check((cv) => {
        cv.education = [
          { period: '2010–2013', school: 'University of London', degree: 'B.Sc. Mathematics' }
        ];
      })
    ).toEqual([]);
  });
});

// The advert's plain words (#296): a tailoring rewords into the advert's vocabulary, and its function words, its
// plain verbs and what a claim measures are no claim; a quality the source never claims still is.
describe('a rewording into the advert’s plain words', () => {
  const ADVERT = [
    'Senior iOS Engineer (m/f/d) – Berlin or remote',
    '',
    'Responsibilities',
    '- Design, build and ship production iOS features in Swift and SwiftUI',
    '- Own the architecture of a scalable, modular codebase',
    '- Improve app performance, stability and accessibility',
    '- Mentor engineers and drive engineering quality through code reviews',
    '- Across teams, deliver reliable releases with CI/CD pipelines',
    '',
    'Requirements',
    '- Strong Swift, SwiftUI and Combine knowledge',
    '- Kotlin Multiplatform is a plus',
    '',
    'Benefits',
    '- Competitive salary, hybrid work, 30 days of holiday'
  ].join('\n');
  const reword = (path, text) =>
    check(
      (cv) => {
        const [, role, field, index] = /^relevant_experience\[(\d)\]\.(\w+)(?:\[(\d)\])?$/.exec(
          path
        );
        if (index === undefined) cv.relevant_experience[role][field] = text;
        else cv.relevant_experience[role][field][index] = text;
      },
      { terms: [], advert: ADVERT }
    );

  // The second review of #315: a plain word the tailoring was shown as a required term, and one that opens an advert's
  // bullet, came back as additions.
  test('a plain word passes when it is one of the advert’s terms, or opens one of its bullets', () => {
    const advert = `${ADVERT}\n- Set up Gradle build caching`;
    const shown = (edit) => check(edit, { terms: ['knowledge', 'Exposure'], advert });

    expect(
      shown(
        (cv) =>
          (cv.relevant_experience[0].highlights[0] =
            'Brought SwiftUI knowledge to Engine Notes for iOS from its first commit in 2021: Clean Architecture, TDD.')
      )
    ).toEqual([]);
    expect(
      shown(
        (cv) =>
          (cv.relevant_experience[1].highlights[0] =
            'Gained exposure to Swift while moving the app from Objective-C.')
      )
    ).toEqual([]);
    expect(
      shown(
        (cv) =>
          (cv.relevant_experience[0].highlights[2] = 'Set up App Store releases every two weeks.')
      )
    ).toEqual([]);
  });

  // The third review of #315.
  test('a skill the full CV lists is held whatever it is called, and a term said twice is one addition', () => {
    // Parsed, not cloned: the check walks plain objects of this realm only, and Jest's structuredClone makes the host's.
    const skilled = JSON.parse(JSON.stringify(SOURCE));
    skilled.skills[1].items.push({ name: 'Design' });
    const designed = structuredClone(skilled);
    designed.relevant_experience[0].highlights[1] =
      'Led the design of the test suite, cutting it from 37.7 to 5.2 minutes.';
    expect(
      ProvenanceCheck.failures({
        source: skilled,
        tailored: designed,
        sources: itself(skilled),
        terms: [],
        advert: ''
      })
    ).toEqual([expect.objectContaining({ reason: 'says "Design", which its source does not' })]);

    const twice = `${ADVERT}\n- Performance matters`;
    expect(
      reasonsAt(
        check(
          (cv) => (cv.relevant_experience[0].highlights[1] = 'Cut the performance-critical suite.'),
          { terms: [], advert: twice }
        ),
        'relevant_experience[0].highlights[1]'
      )
    ).toEqual(['says "performance", which its source does not']);
  });

  test.each([
    ['relevant_experience[0].summary', 'Owned the iOS client in a team of 2 engineers.'],
    ['relevant_experience[0].highlights[1]', 'Cut test performance from 37.7 to 5.2 minutes.'],
    ['relevant_experience[0].highlights[1]', 'Improved test speed: from 37.7 to 5.2 minutes.'],
    [
      'relevant_experience[0].highlights[2]',
      'Shipped App Store releases every two weeks through the year.'
    ]
  ])('%s as "%s" holds', (path, text) => {
    expect(reword(path, text)).toEqual([]);
  });

  test.each([
    ['relevant_experience[0].summary', 'Owned the scalable iOS client in a team of 2.', 'scalable'],
    [
      'relevant_experience[0].highlights[2]',
      'Shipped reliable App Store releases every two weeks.',
      'reliable'
    ],
    // What a claim measures, beside no figure, is the claim (the review of #315).
    ['relevant_experience[0].highlights[1]', 'Improved app performance.', 'performance'],
    [
      'relevant_experience[0].highlights[2]',
      'Shipped App Store releases every two weeks, for stability.',
      'stability'
    ],
    // A figure before it measures something else (the second review of #315).
    [
      'relevant_experience[0].highlights[2]',
      'Shipped App Store releases every two weeks for stability.',
      'stability'
    ]
  ])('%s as "%s" claims what the source does not', (path, text, word) => {
    expect(reasonsAt(reword(path, text), path)).toEqual([
      `says "${word}", which its source does not`
    ]);
  });
});

// The letter (#299): addressed as the advert addresses it, arguing from the full CV, and stating only the salary and
// the start the defaults give.
describe('a tailored letter', () => {
  const ADVERT = [
    'Senior iOS Engineer at Engine Works, Berlin',
    'Reference: EW-2026-117',
    'Your contact: Frau Dr. Grace Hopper, Head of Mobile',
    'Engine Works GmbH, Hauptstraße 1, 10115 Berlin',
    'Our 40,000 technicians rely on the app.'
  ].join('\n');
  const LETTER = {
    recipient: {
      company: 'Engine Works GmbH',
      name: 'Grace Hopper',
      form: 'ms',
      title: 'Dr.',
      surname: 'Hopper',
      role: 'Head of Mobile',
      address: ['Hauptstraße 1', '10115 Berlin']
    },
    reference: 'EW-2026-117',
    position: 'Senior iOS Engineer',
    subject: 'Senior iOS Engineer',
    opening: 'I am writing about the Senior iOS Engineer role.',
    body: ['At Analytical Engines I cut the test suite from 37.7 to 5.2 minutes.'],
    closing: 'I look forward to hearing from you.'
  };
  const letterCheck = (edit = () => {}, { advert = ADVERT, defaults = {} } = {}) => {
    const tailored = structuredClone(SOURCE);
    tailored.letter = structuredClone(LETTER);
    edit(tailored.letter);
    return ProvenanceCheck.failures({
      source: SOURCE,
      tailored,
      sources: itself(SOURCE),
      terms: [],
      advert,
      defaults
    });
  };

  test('addressed as the advert addresses it, arguing from the full CV, holds', () => {
    expect(letterCheck()).toEqual([]);
  });

  test('a company, a contact, an address or a reference the advert does not write is refused', () => {
    const failures = letterCheck((letter) => {
      letter.recipient.company = 'Engine Works Ltd';
      letter.recipient.name = 'Ada Byron';
      letter.recipient.address = ['Friedrichstraße 9'];
      letter.reference = 'EW-2025-001';
    });
    expect(failures.map(({ path }) => path)).toEqual([
      'letter.recipient.company',
      'letter.recipient.name',
      'letter.recipient.address[0]',
      'letter.reference'
    ]);
  });

  test('a form of address is taken only when the advert writes it before the contact’s name', () => {
    expect(letterCheck((letter) => (letter.recipient.form = 'mr'))).toEqual([
      expect.objectContaining({ path: 'letter.recipient.form' })
    ]);
    // An advert that names the contact without a form of address: "Grace" says nothing about how to greet her.
    const unwritten = ADVERT.replace('Frau Dr. Grace Hopper', 'Grace Hopper');
    const plain = (form) => (letter) => {
      letter.recipient.form = form;
      delete letter.recipient.title;
      letter.opening = 'I am writing about the role Grace Hopper leads.';
    };
    expect(letterCheck(plain('ms'), { advert: unwritten })).toEqual([
      expect.objectContaining({ path: 'letter.recipient.form' })
    ]);
    expect(letterCheck(plain('neutral'), { advert: unwritten })).toEqual([]);
  });

  test('a figure the full CV does not state is refused, the advert’s included; the salary and start given are not', () => {
    const failures = letterCheck((letter) => {
      letter.body.push('Your 40,000 technicians will get an app I rewrote with 7 engineers.');
    });
    // The advert's facts are its own: its figure, and its technicians, are not the candidate's to state.
    expect(failures.map(({ reason }) => reason)).toEqual([
      'states 40,000, which its source does not',
      'states 7, which its source does not',
      'says "technicians", which its source does not'
    ]);
    expect(
      letterCheck(
        (letter) => letter.body.push('I would expect €85,000 a year, and could start in 2026-12.'),
        { defaults: { salaryExpectation: '€85,000 a year', startDate: '2026-12' } }
      )
    ).toEqual([]);
    expect(
      letterCheck((letter) => letter.body.push('I would expect €95,000 a year.'), {
        defaults: { salaryExpectation: '€85,000 a year' }
      })
    ).toEqual([expect.objectContaining({ reason: 'states 95,000, which its source does not' })]);
  });

  test('an employer neither the full CV nor the advert names is refused', () => {
    expect(
      letterCheck((letter) => letter.body.push('Before that I built apps at Jacquard Looms.'))
    ).toEqual([
      expect.objectContaining({ reason: 'names "Jacquard", which its source does not' }),
      expect.objectContaining({ reason: 'names "Looms", which its source does not' })
    ]);
  });
});

// What the review of #300 found passing, or refused, that should not have been.
describe('what the review of the letter found', () => {
  const ADVERT = [
    'Senior iOS Engineer at Engine Works, Berlin',
    'Requirements: Kotlin Multiplatform in production.',
    'Ihre Bewerbung richten Sie bitte an Herrn Max Müller, Leiter Mobile.',
    'Or write to MS GRACE HOPPER, or to Herr John von Neumann, or to Dr Ada Byron.'
  ].join('\n');
  const letter = (edit) => {
    const tailored = structuredClone(SOURCE);
    tailored.letter = {
      recipient: { company: 'Engine Works' },
      subject: 'Senior iOS Engineer',
      opening: 'I am writing about the Senior iOS Engineer role.',
      body: ['At Analytical Engines I cut the test suite from 37.7 to 5.2 minutes.'],
      closing: 'I look forward to hearing from you.'
    };
    edit(tailored.letter);
    return ProvenanceCheck.failures({
      source: SOURCE,
      tailored,
      sources: itself(SOURCE),
      terms: ['Kotlin Multiplatform'],
      advert: ADVERT,
      defaults: { startDate: '2026-12-01' }
    });
  };

  test('the advert names the addressee, and backs none of the letter’s claims', () => {
    expect(
      letter((l) => l.body.push('I have shipped Kotlin Multiplatform apps to production.'))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'names "Kotlin", which its source does not' })
      ])
    );
  });

  test.each([
    ['opening', 'Dear Dr. Hopper,'],
    ['opening', 'Sehr geehrte Frau Dr. Hopper,'],
    ['closing', 'Kind regards'],
    ['closing', 'Mit freundlichen Grüßen']
  ])('a salutation or a valediction in its %s is refused: %s', (field, text) => {
    expect(letter((l) => (l[field] = text)).map(({ path }) => path)).toContain(`letter.${field}`);
  });

  test.each([
    ['mr', 'Max Müller', 'Müller'],
    ['ms', 'Grace Hopper', 'Hopper'],
    ['mr', 'John von Neumann', 'Neumann']
  ])('the form %s is taken as the advert writes it before %s', (form, name, surname) => {
    expect(letter((l) => (l.recipient = { company: 'Engine Works', name, surname, form }))).toEqual(
      []
    );
  });

  test('a title is the advert’s with or without its dot', () => {
    expect(
      letter((l) => (l.recipient = { company: 'Engine Works', name: 'Ada Byron', title: 'Dr.' }))
    ).toEqual([]);
  });

  test.each([
    'I could start on 1 December 2026.',
    'Ich könnte zum 1. Dezember 2026 beginnen.',
    'Ich könnte zum 01.12.2026 beginnen.'
  ])('the start the defaults give may be written as a reader writes it: %s', (sentence) => {
    expect(letter((l) => l.body.push(sentence))).toEqual([]);
  });

  test('a start other than the one given is refused', () => {
    expect(letter((l) => l.body.push('I could start on 1 January 2027.'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'states 2027, which its source does not' })
      ])
    );
  });

  test('a letter that says nothing is refused', () => {
    expect(
      letter((l) => {
        delete l.subject;
        delete l.opening;
        l.body = [];
      }).map(({ path }) => path)
    ).toEqual(['letter.subject', 'letter.opening', 'letter.body']);
  });
});

// What the second review of #300 found: the advert's phrases passed its words, and the letter's end went unread.
describe('what the second review of the letter found', () => {
  const ADVERT = [
    'Senior Flutter Engineer at Engine Works GmbH',
    'Your contact: Ms Grace Hopper, Flutter Lead',
    'Engine Works GmbH, Hauptstraße 1, 10115 Berlin'
  ].join('\n');
  const letter = (edit, advert = ADVERT) => {
    const tailored = structuredClone(SOURCE);
    tailored.letter = {
      recipient: {
        company: 'Engine Works GmbH',
        name: 'Grace Hopper',
        surname: 'Hopper',
        role: 'Flutter Lead',
        address: ['Hauptstraße 1', '10115 Berlin']
      },
      position: 'Senior Flutter Engineer',
      subject: 'Senior Flutter Engineer',
      opening: 'I am writing about the Senior Flutter Engineer role.',
      body: ['At Analytical Engines I cut the test suite from 37.7 to 5.2 minutes.'],
      closing: 'I look forward to hearing from you.'
    };
    edit(tailored.letter);
    return ProvenanceCheck.failures({
      source: SOURCE,
      tailored,
      sources: itself(SOURCE),
      terms: ['Flutter'],
      advert
    });
  };

  test('the role, the contact and the advertiser are named in the advert’s words, and hold', () => {
    expect(
      letter((l) =>
        l.body.push(
          'I would be glad to talk to Grace Hopper, Flutter Lead, about joining Engine Works in Berlin.'
        )
      )
    ).toEqual([]);
  });

  test('a technology in the contact’s title or the role’s is not the candidate’s', () => {
    expect(
      letter((l) => l.body.push('I have shipped Flutter apps to production.')).map(
        ({ reason }) => reason
      )
    ).toEqual(['names "Flutter", which its source does not']);
  });

  test('a role the advert does not write is refused', () => {
    expect(letter((l) => (l.position = 'Staff Flutter Engineer')).map(({ path }) => path)).toEqual(
      expect.arrayContaining(['letter.position'])
    );
  });

  test('a form of address written before another contact is not hers', () => {
    const two =
      'Senior Flutter Engineer at Engine Works GmbH\nWrite to Frau Müller und Grace Hopper.';
    expect(
      letter((l) => {
        l.recipient = { company: 'Engine Works GmbH', name: 'Grace Hopper', form: 'ms' };
      }, two).map(({ path }) => path)
    ).toContain('letter.recipient.form');
  });

  test.each([
    ['closing', 'I look forward to hearing from you. Kind regards'],
    ['body[1]', 'Dear Dr. Hopper,'],
    ['body[1]', 'Kind regards'],
    ['body[1]', 'Mit freundlichen Grüßen'],
    ['opening', 'To whom it may concern,']
  ])('a salutation or a valediction anywhere it prints is refused: %s "%s"', (path, text) => {
    const edit = (l) => {
      if (path === 'body[1]') {
        l.body.push(text);
        delete l.closing;
      } else l[path] = text;
    };
    expect(letter(edit).map(({ path: at }) => at)).toContain(`letter.${path}`);
  });
});

// What the third review of #300 found: the phrases taken out, the letter's end, and the addresses a letter meets.
describe('what the third review of the letter found', () => {
  const ADVERT = [
    'SAP Fiori Developer at SAP SE',
    'Kontakt: Frau Anna-Lena Hopper, Engine Works UG (haftungsbeschränkt), A-1010 Wien',
    'Reference: REQ/2026/117+ for our C++ Engineer and Head of R&D'
  ].join('\n');
  const letter = (edit, { language = 'en' } = {}) => {
    const tailored = structuredClone(SOURCE);
    tailored.letter = {
      recipient: { company: 'SAP SE' },
      position: 'SAP Fiori Developer',
      subject: 'SAP Fiori Developer',
      opening: 'I am writing about the SAP Fiori Developer role.',
      body: ['At Analytical Engines I cut the test suite from 37.7 to 5.2 minutes.'],
      closing: 'I look forward to hearing from you.'
    };
    edit(tailored.letter);
    return ProvenanceCheck.failures({
      source: SOURCE,
      tailored,
      sources: itself(SOURCE),
      terms: [],
      advert: ADVERT,
      language
    });
  };

  test('a role that carries the company’s name is read whole, before the company’s', () => {
    expect(letter(() => {})).toEqual([]);
  });

  test('a name after a phrase taken out is still a name', () => {
    expect(
      letter((l) => (l.subject = 'SAP Fiori Developer Zephyr')).map(({ reason }) => reason)
    ).toEqual(['names "Zephyr", which its source does not']);
  });

  test('a valediction after a line break is read, in German too', () => {
    const german = letter(
      (l) => {
        l.opening = 'Ich schreibe Ihnen wegen der Stelle als SAP Fiori Developer.';
        l.body = [
          'Bei Analytical Engines habe ich die Testlaufzeit von 37,7 auf 5,2 Minuten gesenkt.'
        ];
        l.closing = 'Ich freue mich auf Ihre Antwort\n\nMit freundlichen Grüßen';
      },
      { language: 'de' }
    );
    // The rest of the CV is not translated here, so only the letter is read.
    expect(german.map(({ path }) => path).filter((path) => path.startsWith('letter.'))).toEqual([
      'letter.closing'
    ]);
  });

  test('an Austrian address, a company’s German legal form and a hyphenated given name are the advert’s', () => {
    expect(
      letter((l) => {
        l.recipient = {
          company: 'Engine Works UG (haftungsbeschränkt)',
          name: 'Anna-Lena Hopper',
          surname: 'Hopper',
          form: 'ms',
          address: ['A-1010 Wien']
        };
        l.body.push('I would gladly join Engine Works in Wien.');
      })
    ).toEqual([]);
  });

  test('a phrase with the marks a pattern reads is taken out as written', () => {
    expect(
      letter((l) => {
        l.reference = 'REQ/2026/117+';
        l.recipient.role = 'Head of R&D';
        l.body.push('I write about REQ/2026/117+ to the Head of R&D.');
      })
    ).toEqual([]);
  });
});

// A translation (#299): German capitalises its nouns, so a capital names nothing; the names, figures and dates are
// what a translation keeps, and what it is held to.
describe('a tailored CV translated into German', () => {
  const translate = (
    edit = () => {},
    { advert = '', terms = ['Kotlin'], source = SOURCE } = {}
  ) => {
    const tailored = structuredClone(source);
    tailored.location = 'London';
    tailored.relevant_experience[0].period = 'Januar 2021 – Dezember 2023';
    tailored.relevant_experience[0].title = 'iOS-Entwickler';
    tailored.relevant_experience[0].location = 'London (remote)';
    tailored.relevant_experience[0].summary = 'Verantwortete den iOS-Client in einem Team von 2.';
    tailored.relevant_experience[0].highlights = [
      'Engine Notes für iOS, in SwiftUI gebaut seit dem ersten Commit 2021: Clean Architecture, TDD.',
      'Testlaufzeit von 37,7 auf 5,2 Minuten gesenkt.',
      'App-Store-Releases alle zwei Wochen.'
    ];
    tailored.languages = [{ name: 'Englisch', level: 'Muttersprache' }];
    tailored.education = [
      { degree: 'B.Sc. Mathematik', school: 'University of London', period: '2010–2013' }
    ];
    tailored.certifications = [
      { name: 'Certified Engine Operator', issuer: 'Babbage Institute', year: 2020 }
    ];
    const sources = {
      ...itself(source),
      'education[0]': 'education[0]',
      'certifications[0]': 'certifications[0]',
      'languages[0]': 'languages[0]'
    };
    edit(tailored, sources);
    return ProvenanceCheck.failures({
      source,
      tailored,
      sources,
      terms,
      advert,
      language: 'de'
    });
  };

  test('a faithful translation holds: its nouns capitalised, its months in German, its figures in German', () => {
    expect(translate()).toEqual([]);
  });

  // The third review of #315: the dimension's clause was folded, and "zwölf" folded is no number word.
  test('a dimension before a figure written in German words holds', () => {
    expect(
      ProvenanceCheck.additions(
        'Performance der Tests: zwölf Durchläufe.',
        'Cut the test suite over 12 runs.',
        { vocabulary: ['performance'] }
      )
    ).not.toContain('says "performance", which its source does not');
  });

  test('a name the full CV writes holds inside a German compound (the second review of #300)', () => {
    expect(
      translate((cv) => {
        cv.relevant_experience[0].highlights[0] =
          'Engine-Notes-App für iOS, in SwiftUI gebaut seit dem ersten Commit 2021: Clean Architecture, TDD.';
      })
    ).toEqual([]);
  });

  test('a figure changed, or a period that is other dates, is refused', () => {
    const failures = translate((cv) => {
      cv.relevant_experience[0].highlights[1] = 'Testlaufzeit von 37,7 auf 4 Minuten gesenkt.';
      cv.relevant_experience[0].period = 'Januar 2021 – Januar 2024';
    });
    expect(failures).toEqual([
      { path: 'relevant_experience[0].period', reason: "is not relevant_experience[0]'s period" },
      {
        path: 'relevant_experience[0].highlights[1]',
        reason: 'states 4, which its source does not'
      }
    ]);
  });

  test('a name the source writes, or a technology, is held; a German noun is not', () => {
    const failures = translate(
      (cv) => {
        cv.relevant_experience[0].highlights[2] =
          'App-Store-Releases alle zwei Wochen, mit Kotlin und Bitrise.';
      },
      {
        advert: `${'We build mobile apps for field technicians in Berlin and Munich. '.repeat(3)}Requirements: Kotlin and Bitrise.`
      }
    );
    expect(failures.map(({ reason }) => reason)).toEqual([
      'names "Kotlin", which its source does not',
      'names "Bitrise", which its source does not'
    ]);
  });

  test('a title may be worded in German, but claims no seniority its source does not', () => {
    expect(
      translate((cv) => (cv.relevant_experience[0].title = 'Leitender iOS-Entwickler'))
    ).toEqual([
      {
        path: 'relevant_experience[0].title',
        reason: 'claims "leitender", which its source does not'
      }
    ]);
  });

  test('the identity it copies is copied; an entry names its source, and keeps its school and dates', () => {
    const failures = translate((cv, sources) => {
      cv.email = 'ada@beispiel.de';
      cv.education[0].school = 'Universität London';
      delete sources['languages[0]'];
    });
    expect(failures).toEqual([
      { path: 'email', reason: "is the source's identity, and changed" },
      { path: 'education[0].school', reason: "is not education[0]'s school" },
      { path: 'languages[0]', reason: 'names no source item' }
    ]);
  });

  test('a technology an English advert names is held in a German compound too', () => {
    const failures = translate(
      (cv) => {
        cv.relevant_experience[0].highlights[2] =
          'App-Store-Releases alle zwei Wochen, mit Flutter-Kenntnissen.';
      },
      {
        advert: `${'We build mobile apps for field technicians in Berlin and Munich. '.repeat(3)}Requirements: Flutter.`
      }
    );
    expect(failures.map(({ reason }) => reason)).toEqual([
      'names "Flutter-Kenntnissen", which its source does not'
    ]);
  });

  // Ranks, not words (#313): a lead is a Leiter, and a companion — "Begleiter" — is no rank.
  test('a title translated in the rank its source claims holds, and a word that only ends like one claims none', () => {
    // Parsed, not cloned: the check walks plain objects of this realm only.
    const led = JSON.parse(JSON.stringify(SOURCE));
    led.relevant_experience[0].title = 'iOS Team Lead';
    const at = (failures) => failures.filter(({ path }) => path === 'relevant_experience[0].title');

    expect(
      at(translate((cv) => (cv.relevant_experience[0].title = 'iOS-Teamleiter'), { source: led }))
    ).toEqual([]);
    expect(
      at(
        translate(
          (cv) => (cv.relevant_experience[0].title = 'iOS-Entwickler und Begleiter im Team')
        )
      )
    ).toEqual([]);
  });

  test.each(['Teamleiter iOS', 'Softwarearchitekt', 'Chefentwickler iOS'])(
    'a title translated as %s claims a seniority its source does not',
    (title) => {
      expect(
        translate((cv) => (cv.relevant_experience[0].title = title)).map(({ path }) => path)
      ).toContain('relevant_experience[0].title');
    }
  );

  // The German profile, written in German by a native speaker from the English one (#26), read as a translation of
  // it: what it adds is "KI" — "AI" — where the English writes "agentic development". Nothing else is refused. This
  // test changes when either profile does, which is the point: it is a translation's check on a real translation.
  test('the repository’s German profile, as a translation of the English, adds only "KI"', () => {
    const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
    const en = read('profiles/general/en.json');
    const de = read('profiles/general/de.json');
    const sources = itself(en);
    for (const key of ['education', 'certifications', 'languages']) {
      (en[key] || []).forEach((_, index) => (sources[`${key}[${index}]`] = `${key}[${index}]`));
    }

    const failures = ProvenanceCheck.failures({
      source: en,
      tailored: de,
      sources,
      language: 'de'
    });

    expect(new Set(failures.map(({ reason }) => reason))).toEqual(
      new Set(['names "KI-Agenten", which its source does not'])
    );
  });
});

describe('the names a text writes', () => {
  // A sentence begins at the start and after a full stop; after a colon, a semicolon or a dash it goes on, and a
  // capital there is a name (the review of #286).
  test('a word with a capital is a name, except where a sentence begins', () => {
    expect(
      ProvenanceCheck.names(
        'Moved the app to SwiftUI. Cut tests: Clean Architecture, TDD, iOS, 5G; Fastlane – Docker.'
      )
    ).toEqual(['SwiftUI', 'Clean', 'Architecture', 'TDD', 'iOS', '5G', 'Fastlane', 'Docker']);
  });
});

// The published CVs, mapped to themselves, hold: the check refuses nothing the repository already says.
describe('every profile in the repository, tailored to itself', () => {
  const profiles = readdirSync(new URL('../profiles/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((directory) =>
      readdirSync(new URL(`../profiles/${directory.name}/`, import.meta.url))
        .filter((file) => file === 'en.json')
        .map((file) => `profiles/${directory.name}/${file}`)
    );

  test.each(profiles)('%s holds', (path) => {
    const source = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
    expect(
      ProvenanceCheck.failures({
        source,
        tailored: structuredClone(source),
        sources: itself(source)
      })
    ).toEqual([]);
  });
});

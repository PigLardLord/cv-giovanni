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

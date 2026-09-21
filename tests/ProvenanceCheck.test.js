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

const check = (edit = () => {}, { sources, terms = ['Kotlin', 'Jetpack Compose'] } = {}) => {
  const tailored = structuredClone(SOURCE);
  const mapped = sources ?? itself(SOURCE);
  edit(tailored, mapped);
  return ProvenanceCheck.failures({ source: SOURCE, tailored, sources: mapped, terms });
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
    expect(failures).toEqual([
      expect.objectContaining({
        path: 'relevant_experience[0].summary',
        reason: expect.stringMatching(/^"three years": /)
      })
    ]);
  });
});

describe('the names a text writes', () => {
  test('a word with a capital is a name, except where a sentence or a clause after a colon begins', () => {
    expect(
      ProvenanceCheck.names(
        'Moved the app to SwiftUI. Cut tests: Clean Architecture, TDD, iOS, 5G.'
      )
    ).toEqual(['SwiftUI', 'Architecture', 'TDD', 'iOS', '5G']);
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

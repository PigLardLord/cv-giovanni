import { readFileSync, readdirSync } from 'node:fs';
import { driftingSpans } from '../domain/StatedSpans.js';

// #55 stopped typing lengths into the periods, because a typed length is wrong the month after it is written. A
// sentence can make the same mistake: "six years owning an enterprise MDM client" agreed with the dates the day it
// was written and contradicted them the day the anniversary passed (#104). What a sentence may say about time:
// - a floor, "11+ years", which only grows truer;
// - an exact count tied to a role that has ended, "8 of them at Cortado", when the role's dates agree with it.
// Anything else exact is a span the calendar will overtake.
const cv = (overrides = {}) => ({
  name: 'Ada Lovelace',
  asOf: '2026-09',
  profile:
    'Engineer with 11+ years in native mobile development, 8 of them at Cortado Mobile Solutions.',
  relevant_experience: [
    {
      title: 'iOS Developer',
      company: 'Cortado Mobile Solutions',
      period: 'August 2018 – November 2026'
    },
    { title: 'Mobile Developer', company: 'Apparound', period: 'September 2015 – July 2018' }
  ],
  ...overrides
});

describe('the spans of time a profile states', () => {
  test('a floor, and an exact count the dates of an ended role agree with, stay true', () => {
    expect(driftingSpans(cv())).toEqual([]);
  });

  test('a count with no role behind it is a span the calendar will overtake', () => {
    const planted = cv({
      career_highlights: ['6 years owning an enterprise iOS MDM client from its first commit']
    });

    expect(driftingSpans(planted)).toEqual([
      expect.objectContaining({
        field: 'career_highlights[0]',
        said: '6 years',
        why: expect.stringMatching(/calendar/)
      })
    ]);
  });

  test('so is one written in words, which is how the first one was written', () => {
    const planted = cv({ profile: 'Engineer with six years owning an enterprise MDM client.' });

    expect(driftingSpans(planted).map(({ said }) => said)).toEqual(['six years']);
  });

  test('a count over a role that is still running will be overtaken too', () => {
    const running = cv({
      relevant_experience: [
        {
          title: 'iOS Developer',
          company: 'Cortado Mobile Solutions',
          period: 'August 2018 – Present'
        }
      ]
    });

    expect(driftingSpans(running)).toEqual([
      expect.objectContaining({
        said: '8 of them at Cortado Mobile Solutions',
        why: expect.stringMatching(/running/)
      })
    ]);
  });

  test('a count the ended role’s dates contradict is wrong already', () => {
    const wrong = cv({
      profile:
        'Engineer with 11+ years in native mobile development, 9 of them at Cortado Mobile Solutions.'
    });

    expect(driftingSpans(wrong)).toEqual([
      expect.objectContaining({
        said: '9 of them at Cortado Mobile Solutions',
        why: expect.stringMatching(/8/)
      })
    ]);
  });

  test('a count at an employer the CV does not list names no role to check it against', () => {
    const nowhere = cv({ profile: 'Engineer with 11+ years, 3 of them at Initech.' });

    expect(driftingSpans(nowhere)).toEqual([
      expect.objectContaining({
        said: '3 of them at Initech',
        why: expect.stringMatching(/no role/)
      })
    ]);
  });

  // German writes the same two shapes: "über 11 Jahren" is a floor, "davon 8 bei …" a count tied to a role.
  test('German is read by the same rule', () => {
    const german = cv({
      profile:
        'Senior iOS Engineer mit über 11 Jahren nativer App-Entwicklung, davon 8 bei Cortado Mobile Solutions.',
      relevant_experience: [
        { title: 'iOS Developer', company: 'Cortado Mobile Solutions', period: '08/2018 – 11/2026' }
      ]
    });

    expect(driftingSpans(german)).toEqual([]);
    expect(
      driftingSpans({ ...german, career_highlights: ['seit sechs Jahren verantwortlich'] }).map(
        ({ said }) => said
      )
    ).toEqual(['sechs Jahren']);
  });

  test('a period is a date range, not a sentence, and is not read as one', () => {
    const periods = cv({
      relevant_experience: [{ company: 'X', period: '2014 – 2016' }],
      education: [{ degree: 'B.Sc.', period: '2009' }]
    });

    expect(driftingSpans(periods).filter(({ field }) => /period/.test(field))).toEqual([]);
  });
});

// And the rule holds for every profile the repository has, published or not.
describe('every profile in the repository', () => {
  const profiles = readdirSync(new URL('../profiles/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((directory) =>
      readdirSync(new URL(`../profiles/${directory.name}/`, import.meta.url))
        .filter((file) => file.endsWith('.json'))
        .map((file) => `profiles/${directory.name}/${file}`)
    );

  test.each(profiles)('%s states no span the calendar will overtake', (path) => {
    const profile = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
    expect(driftingSpans(profile)).toEqual([]);
  });
});

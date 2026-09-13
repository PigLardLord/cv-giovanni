import { CvDocument } from '../domain/CvDocument.js';

test('maps source data into a framework-free document model', () => {
  const model = new CvDocument({
    name: 'Candidate',
    title: 'Engineer',
    profile: 'Summary',
    skills: [{ category: 'iOS', items: [] }],
    social: [{ platform: 'GitHub', url: 'https://example.test' }]
  });

  expect(model.identity.name).toBe('Candidate');
  expect(model.identity.social).toHaveLength(1);
  expect(model.skills[0].category).toBe('iOS');
  expect(model.experience).toEqual([]);
});

// Interests are part of the CV like every other section. The model carries them, so every output
// boundary built on it can reach them, whether or not it shows them (#35).
test('carries the interests the profile writes, and none when it writes none', () => {
  expect(new CvDocument({ interests: ['Mountain Hiking', 'Tech Mentoring'] }).interests).toEqual([
    'Mountain Hiking',
    'Tech Mentoring'
  ]);
  expect(new CvDocument({}).interests).toEqual([]);
});

// A role's length is counted from its period, and a role still running is counted to the month the profile
// says it is written as of. A build-time clock would make the same commit produce different documents on
// different days (#55).
describe('how long each role lasted', () => {
  const cv = new CvDocument({
    asOf: '2026-09',
    relevant_experience: [
      { company: 'Cortado', period: 'August 2018 – Present' },
      { company: 'Apparound', period: 'September 2015 – July 2018' },
      { company: 'Marte 5', period: 'May 2015 – August 2015' },
      { company: 'School', period: '2015' }
    ]
  });

  test('reads the month the profile is written as of', () => {
    expect(cv.asOf).toEqual({ year: 2026, month: 9 });
    expect(new CvDocument({ asOf: 'September 2026' }).asOf).toBeNull();
    expect(new CvDocument({}).asOf).toBeNull();
  });

  test('counts both ends of a period, and a running role up to that month', () => {
    expect(cv.experience.map((role) => cv.monthsIn(role))).toEqual([98, 35, 4, null]);
  });

  test('a running role has no length when the profile names no month', () => {
    const undated = new CvDocument({ relevant_experience: [{ period: 'August 2018 – Present' }] });

    expect(undated.monthsIn(undated.experience[0])).toBeNull();
  });
});

/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { CvDocument } from '../domain/CvDocument.js';
import { DateRange } from '../domain/DateRange.js';

// A duration typed into a period is wrong the month after it is written, and it left the current role with
// none (#55). A profile writes a role's dates only, plus the month it is written as of; every length is
// computed from those.
const profiles = new URL('../profiles/', import.meta.url);
const files = readdirSync(profiles, { recursive: true }).filter((path) => path.endsWith('.json'));

/** What a profile gets wrong about its periods. */
const problems = (profile) => {
  const roles = profile.relevant_experience || [];
  const running = roles.some((role) => DateRange.parse(role.period)?.end === 'present');
  return [
    ...roles
      .filter((role) => DateRange.parse(role.period)?.trailing)
      .map((role) => `${role.company}: "${role.period}" carries a duration`),
    ...(running && !new CvDocument(profile).asOf
      ? ['a role is still running, and asOf names no month to count it to']
      : [])
  ];
};

describe('periods carry dates, never durations', () => {
  test('the check finds a typed duration, and a running role with no month to count to', () => {
    const typed = {
      relevant_experience: [
        { company: 'Apparound', period: 'September 2015 – July 2018 (3 years)' },
        { company: 'Cortado', period: 'August 2018 – Present' }
      ]
    };

    expect(problems(typed)).toEqual([
      'Apparound: "September 2015 – July 2018 (3 years)" carries a duration',
      'a role is still running, and asOf names no month to count it to'
    ]);
  });

  test.each(files)('profiles/%s', (path) => {
    expect(problems(JSON.parse(readFileSync(new URL(path, profiles), 'utf8')))).toEqual([]);
  });
});

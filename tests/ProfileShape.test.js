/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { PROFILE, ProfileShape } from '../core/ProfileShape.js';

// The editor saves the public CV (#23), and a renderer handed a malformed profile fails in a way nobody can
// read. So a profile is checked against the shape the renderers and the PDF read before it is saved, and
// every problem comes back with where it is and what to write instead.
const published = JSON.parse(
  readFileSync(new URL('../profiles/general/en.json', import.meta.url), 'utf8')
);
const changed = (change) => {
  const profile = structuredClone(published);
  change(profile);
  return profile;
};
const at = (problems) => problems.map(({ path }) => path);

describe('the shape of a profile', () => {
  test('the published profile has no problem', () => {
    expect(ProfileShape.problems(published)).toEqual([]);
  });

  test('every field the published profile writes is one the shape knows', () => {
    expect(Object.keys(published).filter((key) => !Object.hasOwn(PROFILE.fields, key))).toEqual([]);
  });

  test.each([
    ['a missing name', (p) => delete p.name, 'name', /is required/],
    ['a blank name', (p) => (p.name = '  '), 'name', /is required/],
    ['a title that is not text', (p) => (p.title = 42), 'title', /must be text/],
    [
      'highlights that are not a list',
      (p) => (p.career_highlights = 'Led'),
      'career_highlights',
      /must be a list/
    ],
    [
      'a blank highlight',
      (p) => p.career_highlights.push(''),
      `career_highlights[${published.career_highlights.length}]`,
      /is required/
    ],
    [
      'a month that does not exist',
      (p) => (p.asOf = '2026-13'),
      'asOf',
      /month written as 2026-09/
    ],
    [
      'a period that carries a duration',
      (p) => (p.relevant_experience[1].period = 'September 2015 – July 2018 (3 years)'),
      'relevant_experience[1].period',
      /carries more than its dates/
    ],
    // The code review of #115: a note after the dates was refused as a duration it is not.
    [
      'a period that carries a note',
      (p) => (p.relevant_experience[1].period = 'September 2015 – July 2018 (remote)'),
      'relevant_experience[1].period',
      /carries more than its dates: write the dates only/
    ],
    [
      'a period no reader can decide',
      (p) => (p.relevant_experience[1].period = '03/04/2021 – 05/06/2022'),
      'relevant_experience[1].period',
      /not a period/
    ],
    [
      'a role with no company',
      (p) => delete p.relevant_experience[0].company,
      'relevant_experience[0].company',
      /is required/
    ],
    [
      'a field with a typo in its name',
      (p) => (p.relevant_experience[0].highlight = ['Led']),
      'relevant_experience[0].highlight',
      /not a field the CV reads/
    ],
    [
      'a skill category with no skills',
      (p) => (p.skills[0].items = []),
      'skills[0].items',
      /at least one/
    ],
    [
      'a skill with a blank name',
      (p) => (p.skills[0].items[0].name = ''),
      'skills[0].items[0].name',
      /is required/
    ],
    [
      'a language with no level',
      (p) => delete p.languages[0].level,
      'languages[0].level',
      /is required/
    ],
    [
      'a year written as text',
      (p) => (p.certifications[0].year = '2026'),
      'certifications[0].year',
      /must be a year/
    ],
    // A degree's scope, in ECTS credits (#48): a whole number, as the certificate states it.
    [
      'credits written as text',
      (p) => (p.education[0].credits = '60 ECTS'),
      'education[0].credits',
      /must be the ECTS credits, as a whole number such as 60/
    ],
    [
      'credits of zero',
      (p) => (p.education[0].credits = 0),
      'education[0].credits',
      /whole number such as 60/
    ],
    [
      'credits that are not whole',
      (p) => (p.education[0].credits = 67.5),
      'education[0].credits',
      /whole number such as 60/
    ],
    [
      'credits no programme carries',
      (p) => (p.education[0].credits = 6000),
      'education[0].credits',
      /whole number such as 60/
    ],
    [
      'a link that is not a web address',
      (p) => (p.certifications[0].url = 'javascript:alert(1)'),
      'certifications[0].url',
      /web address/
    ],
    [
      'a social link with no scheme',
      (p) => (p.social[0].url = 'github.com/someone'),
      'social[0].url',
      /web address/
    ],
    // The code review of #115: the PDF links the portfolio as it links a social profile, so it is held to the same.
    [
      'a portfolio that is not a web address',
      (p) => (p.portfolio = 'see my website'),
      'portfolio',
      /web address/
    ],
    [
      'a list that is not a list',
      (p) => (p.relevant_experience = {}),
      'relevant_experience',
      /must be a list/
    ],
    [
      'an entry that is not a group of fields',
      (p) => (p.education[0] = 'MSc'),
      'education[0]',
      /group of fields/
    ],
    [
      'a top-level field the CV does not read',
      (p) => (p.carrer_highlights = []),
      'carrer_highlights',
      /not a field the CV reads/
    ],
    ['no month while a role is still running', (p) => delete p.asOf, 'asOf', /still running/]
  ])('%s is a problem, at its path', (what, change, path, reason) => {
    const problems = ProfileShape.problems(changed(change));

    expect(at(problems)).toEqual([path]);
    expect(problems[0].reason).toMatch(reason);
  });

  test('every problem is reported, in the order of the fields', () => {
    const problems = ProfileShape.problems(
      changed((p) => {
        p.carrer_highlights = [];
        p.interests.push('');
        p.name = '';
      })
    );

    expect(at(problems)).toEqual(['name', 'interests[6]', 'carrer_highlights']);
  });

  test('a degree may state its credits, and need not', () => {
    expect(
      ProfileShape.problems(
        changed((p) => {
          p.education[0].credits = 60;
          delete p.education[1].credits;
        })
      )
    ).toEqual([]);
  });

  test.each([null, [], 'Giovanni Trovato', 42])('%p is not a profile at all', (value) => {
    expect(ProfileShape.problems(value)).toEqual([{ path: '', reason: 'must be a JSON object' }]);
  });
});

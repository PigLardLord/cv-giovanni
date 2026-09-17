/**
 * @jest-environment node
 */
import { ProfileCompleteness } from '../core/ProfileCompleteness.js';
import { ProfileShape } from '../core/ProfileShape.js';

// A profile may leave out a role's location, a degree's period, and a certification's issuer or year: the shape does not
// require them, and since #169 the CV prints without them cleanly. But each carries credibility, and the review of #175
// measured what their absence costs: an undated degree lost to a parser, a renewable certificate nobody can tell current
// from lapsed, one that names no issuer, a role that reads unlike its neighbours. Nothing said so before a tailored
// profile left the machine (#178). This names each, as a warning: the profile is still sound, and still built.
//
// The entries are the published profile's, as the review quoted them, but written here: whether the published profile
// states every one of these fields is its author's call, which the build warns about and no test decides.
const complete = {
  name: 'Giovanni Trovato',
  relevant_experience: [
    {
      title: 'Mobile Software Engineer / Technical Owner, iOS & Android',
      company: 'Cortado Mobile Solutions',
      location: 'Berlin (remote)',
      period: 'August 2018 – July 2026'
    },
    {
      title: 'Mobile Developer',
      company: 'Apparound',
      location: 'Pisa, Italy',
      period: 'September 2015 – July 2018'
    },
    {
      title: 'Mobile Developer Intern',
      company: 'Marte 5',
      location: 'Livorno, Italy',
      period: 'May 2015 – August 2015'
    }
  ],
  education: [
    {
      degree: "First Level Professional Master's Programme in Mobile Applications Development",
      school: 'Università degli Studi di Pisa',
      period: '2014 – 2016',
      credits: 60
    },
    {
      degree: 'B.Sc. Computer Engineering',
      school: 'Università degli Studi di Catania',
      period: '2009'
    }
  ],
  certifications: [
    {
      name: 'Android Enterprise Expert (incl. Associate, Professional)',
      issuer: 'Google',
      year: 2026
    },
    {
      name: 'iOS Lead Essentials (TDD, Clean Architecture)',
      issuer: 'Essential Developer',
      year: 2024
    }
  ]
};
const changed = (change) => {
  const profile = structuredClone(complete);
  change(profile);
  return profile;
};
const at = (omissions) => omissions.map(({ path }) => path);

describe('what a profile leaves out that a reader looks for', () => {
  test('a profile that states every one of them leaves nothing out, and is one the shape accepts', () => {
    expect(ProfileCompleteness.omissions(complete)).toEqual([]);
    expect(ProfileShape.problems(complete)).toEqual([]);
  });

  test("names a degree without a period, by the degree's name", () => {
    const omissions = ProfileCompleteness.omissions(
      changed((profile) => delete profile.education[1].period)
    );

    expect(omissions).toEqual([
      {
        path: 'education[1].period',
        reason: 'is missing: the degree "B.Sc. Computer Engineering" prints with no date'
      }
    ]);
  });

  test("names a certification without a year, and one without an issuer, by the certification's name", () => {
    const omissions = ProfileCompleteness.omissions(
      changed((profile) => {
        delete profile.certifications[0].year;
        delete profile.certifications[1].issuer;
      })
    );

    expect(omissions).toEqual([
      {
        path: 'certifications[0].year',
        reason:
          'is missing: "Android Enterprise Expert (incl. Associate, Professional)" prints with no year, so nobody can tell it current from lapsed'
      },
      {
        path: 'certifications[1].issuer',
        reason:
          'is missing: "iOS Lead Essentials (TDD, Clean Architecture)" prints with no issuer, so nobody can tell who awarded it'
      }
    ]);
  });

  test('names a role without a location while other roles name theirs', () => {
    const omissions = ProfileCompleteness.omissions(
      changed((profile) => delete profile.relevant_experience[1].location)
    );

    expect(omissions).toEqual([
      {
        path: 'relevant_experience[1].location',
        reason:
          'is missing: the role "Mobile Developer" at Apparound prints with no place, while 2 other roles name one'
      }
    ]);
  });

  test('a CV whose roles all name no location is consistent, and leaves nothing out', () => {
    const profile = changed((profile) =>
      profile.relevant_experience.forEach((role) => delete role.location)
    );

    expect(ProfileCompleteness.omissions(profile)).toEqual([]);
  });

  // The warning names what the print leaves out, so it counts a field as missing exactly where the lines do (#169).
  test('a field of whitespace alone is missing, and so is null', () => {
    const profile = changed((profile) => {
      profile.education[0].period = '   ';
      profile.certifications[0].issuer = null;
      profile.relevant_experience[2].location = '';
    });

    expect(at(ProfileCompleteness.omissions(profile))).toEqual([
      'relevant_experience[2].location',
      'education[0].period',
      'certifications[0].issuer'
    ]);
  });

  test('names every omission, roles first, then degrees, then certifications, each in its order', () => {
    const profile = changed((profile) => {
      delete profile.certifications[1].year;
      delete profile.certifications[1].issuer;
      delete profile.education[1].period;
      delete profile.education[0].period;
      delete profile.relevant_experience[2].location;
      delete profile.relevant_experience[1].location;
    });

    const omissions = ProfileCompleteness.omissions(profile);
    expect(at(omissions)).toEqual([
      'relevant_experience[1].location',
      'relevant_experience[2].location',
      'education[0].period',
      'education[1].period',
      'certifications[1].issuer',
      'certifications[1].year'
    ]);
    expect(omissions[1].reason).toBe(
      'is missing: the role "Mobile Developer Intern" at Marte 5 prints with no place, while 1 other role names one'
    );
  });

  // A warning, never a refusal: the shape leaves these fields optional on purpose, and the editor saves the profile.
  test('a profile with every omission is still one the shape accepts', () => {
    const profile = changed((profile) => {
      delete profile.relevant_experience[1].location;
      delete profile.education[1].period;
      delete profile.certifications[0].year;
      delete profile.certifications[1].issuer;
    });

    expect(ProfileCompleteness.omissions(profile)).toHaveLength(4);
    expect(ProfileShape.problems(profile)).toEqual([]);
  });

  test('a profile with no roles, degrees or certifications, or entries that are not groups, leaves nothing out', () => {
    expect(ProfileCompleteness.omissions({ name: 'Ada Lovelace' })).toEqual([]);
    expect(
      ProfileCompleteness.omissions({
        relevant_experience: [null, 'Engineer'],
        education: 'none',
        certifications: [42]
      })
    ).toEqual([]);
    expect(ProfileCompleteness.omissions(null)).toEqual([]);
  });
});

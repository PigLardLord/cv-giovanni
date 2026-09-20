/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// Four neutral reads of the printed CV found the same defect from four sides (#230): one thing carried several
// names. "Play Store" and "Google Play Console", "backend" and "back ends", "Swift Concurrency" and "Swift 6
// concurrency", "iOS MDM client" and "MDM iOS client" — and "MDM" three times before it was spelled out. A recruiter
// reads two names as two things, and a parser searching for one of them finds the CV under half its own keywords.
//
// So each thing is named one way, the abbreviation is spelled out where a reader meets it first, and a level is
// written on one scale. The list below is the rule: a name added to the CV is added here as the form it takes, with
// the forms it replaces.
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('config/cv-manifest.json');
const published = Object.values(manifest.profiles).flatMap(({ locales }) => Object.values(locales));

const NAMES = [
  { one: 'Google Play', instead: /\bPlay Store\b/gi },
  { one: 'backend', instead: /\bback[- ]ends?\b/gi },
  { one: 'Swift concurrency', instead: /\bSwift (?:6 concurrency|Concurrency)\b/g },
  { one: 'code signing and provisioning', instead: /\bsigning & provisioning\b/gi },
  { one: 'Cortado MDM for iOS', instead: /\b(?:iOS MDM|MDM iOS) client\b/gi },
  { one: 'technical mentoring', instead: /\bTech Mentoring\b/gi },
  { one: 'fastlane', instead: /\bFastlane\b/g },
  { one: 'Swift Package Manager', instead: /\bSPM\b/g },
  { one: 'crash reports', instead: /\bcrashes\b/gi },
  { one: 'including', instead: /\bincl\./gi },
  // Neither relationship has a case to show behind it, so the CV states the fact and drops the adverb (#230).
  { one: 'App Review, named as the fact it is', instead: /\bdirectly (?:with|on)\b/gi }
];

/** Every string a profile holds, in the order it writes them. */
const strings = (node) =>
  typeof node === 'string'
    ? [node]
    : node && typeof node === 'object'
      ? Object.values(node).flatMap(strings)
      : [];

/** Every name written in a form the CV does not use, as `form → the one name`. */
const otherNames = (profile) =>
  strings(profile).flatMap((text) =>
    NAMES.flatMap(({ one, instead }) =>
      (text.match(instead) || []).map((form) => `${form} → ${one}`)
    )
  );

// The order a reader meets the profile's words in on paper: the headline and the summary, the evidence, the roles,
// then the lists. An abbreviation is spelled out at the first of these that uses it.
const inPrintedOrder = (profile) => [
  profile.title,
  profile.subtitle,
  profile.profile,
  ...(profile.career_highlights ?? []),
  ...(profile.relevant_experience ?? []).flatMap((role) => [
    role.title,
    role.company,
    role.summary,
    role.description,
    ...(role.highlights ?? [])
  ]),
  ...(profile.skills ?? []).flatMap((group) => [group.category, ...group.items.map((i) => i.name)]),
  ...(profile.certifications ?? []).flatMap((entry) => [entry.name, entry.description]),
  ...(profile.education ?? []).flatMap((entry) => [entry.degree, entry.description])
];

/** The abbreviations used before they are spelled out, in printed order. */
const unspelled = (profile, abbreviations = [['MDM', 'mobile device management']]) => {
  const text = inPrintedOrder(profile).filter(Boolean).join(' | ');
  return abbreviations
    .filter(([short, long]) => {
      const at = text.search(new RegExp(`\\b${short}\\b`));
      if (at < 0) return false;
      return !new RegExp(`${long}\\s*\\($`, 'i').test(text.slice(0, at));
    })
    .map(([short]) => short);
};

// Europass sets language ability on CEFR; the American ILR scale says the same thing in other words, and a line
// carrying both ("C1 — professional working proficiency") claims a precision neither scale gives on its own (#230).
const LEVEL = /^(?:native|[ABC][12] \(CEFR\)(?:, .+)?)$/;

/** Every language level written on any scale but CEFR. */
const offScale = (profile) =>
  (profile.languages ?? [])
    .filter(({ level }) => !LEVEL.test(String(level ?? '')))
    .map(({ name, level }) => `${name}: ${level}`);

describe('the CV names each thing one way', () => {
  test('a form the CV replaced is found, with the name that replaced it', () => {
    expect(
      otherNames({
        profile: 'Released through the Play Store, with REST back ends and Swift 6 concurrency.',
        skills: [{ category: 'iOS', items: [{ name: 'Swift Package Manager (SPM)' }] }]
      })
    ).toEqual([
      'Play Store → Google Play',
      'back ends → backend',
      'Swift 6 concurrency → Swift concurrency',
      'SPM → Swift Package Manager'
    ]);
  });

  test('an abbreviation is spelled out where the print uses it first, and a spelled-out one passes', () => {
    const spelled = {
      profile: 'Built a mobile device management (MDM) client.',
      career_highlights: ['MDM for iOS']
    };
    const bare = {
      profile: 'Built an MDM client.',
      career_highlights: ['mobile device management (MDM)']
    };

    expect(unspelled(spelled)).toEqual([]);
    expect(unspelled(bare)).toEqual(['MDM']);
  });

  test('a level on the ILR scale is found, and CEFR with its evidence is not', () => {
    expect(
      offScale({
        languages: [
          { name: 'Italian', level: 'native' },
          { name: 'English', level: 'C1 (CEFR), working language since 2018' },
          { name: 'German', level: 'A1 — currently studying' }
        ]
      })
    ).toEqual(['German: A1 — currently studying']);
  });

  describe.each(published)('%s', (path) => {
    test('names each thing once', () => expect(otherNames(read(path))).toEqual([]));
    test('spells out each abbreviation where it is first used', () =>
      expect(unspelled(read(path))).toEqual([]));
    test('writes every language level on CEFR', () => expect(offScale(read(path))).toEqual([]));
  });
});

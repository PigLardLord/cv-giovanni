/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// The neutral reads of #230 counted the same claim three times on one page: "six years owning an enterprise MDM
// client" in the summary, "6 years owning an enterprise iOS MDM client from its first commit" under Selected
// Impact, and "Technical owner of the Cortado MDM iOS client for six years from its first commit" in the
// experience. Three sections, one sentence, and a reader who has learnt nothing by the third. #161 held the
// figures apart; this holds the words.
//
// A run of five words is the unit: a product's name is shorter than that and may repeat wherever it is needed —
// "Cortado MDM for Android" is the thing's name, not a phrase — while five words in a row say the same thing twice.
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('config/cv-manifest.json');
const published = Object.values(manifest.profiles).flatMap(({ locales }) => Object.values(locales));

const RUN = 5;

/** The words of a text, folded to compare: case, punctuation and the spaces around them off. */
const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%+~]+/gu, ' ')
    .split(' ')
    .filter(Boolean);

/** Every run of `RUN` words a text holds. */
const runs = (text) => {
  const said = words(text);
  return said.length < RUN
    ? []
    : said.slice(0, said.length - RUN + 1).map((_, at) => said.slice(at, at + RUN).join(' '));
};

/** What each section of the page says, in the order a reader meets them. */
const sectionsOf = (profile) => ({
  summary: [profile.profile],
  'selected impact': profile.career_highlights ?? [],
  experience: (profile.relevant_experience ?? []).flatMap((role) => [
    role.summary,
    role.description,
    ...(role.highlights ?? [])
  ])
});

/** Every run of words two sections both say, as `the run (here and there)`. */
const repeated = (profile) => {
  const sections = Object.entries(sectionsOf(profile)).map(([section, texts]) => [
    section,
    new Map(texts.flatMap((text) => runs(text).map((run) => [run, text])))
  ]);
  return sections.flatMap(([section, said], index) =>
    sections
      .slice(index + 1)
      .flatMap(([other, alsoSaid]) =>
        [...said.keys()]
          .filter((run) => alsoSaid.has(run))
          .map((run) => `"${run}" (${section} and ${other})`)
      )
  );
};

describe('no phrase is repeated across the summary, the evidence and the experience', () => {
  test('a run of five words said twice is found, and a product name said three times is not', () => {
    expect(
      repeated({
        profile:
          'Six years owning an enterprise MDM client, and Cortado MDM for Android from 2025.',
        career_highlights: ['Cortado MDM for Android, 2026: 1,040 → 5,308 tests'],
        relevant_experience: [
          {
            highlights: [
              'Cortado MDM for Android, since 2025: Jetpack Compose',
              'Six years owning an enterprise MDM client from its first commit'
            ]
          }
        ]
      })
    ).toEqual([
      '"six years owning an enterprise" (summary and experience)',
      '"years owning an enterprise mdm" (summary and experience)',
      '"owning an enterprise mdm client" (summary and experience)'
    ]);
  });

  test('a profile with one section repeats nothing', () => {
    expect(
      repeated({ profile: 'Senior iOS engineer with 11+ years of native mobile development.' })
    ).toEqual([]);
  });

  test.each(published)('%s', (path) => {
    expect(repeated(read(path))).toEqual([]);
  });
});

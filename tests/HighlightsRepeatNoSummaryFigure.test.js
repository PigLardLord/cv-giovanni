/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// Two of the three career highlights restated the summary directly above them (#161), and the rewrite of #229 kept
// it so: the summary said "in 2026 grew branch coverage from 14% to 83%", and the highlight under it "branch
// coverage 14% → 83%". The section is the first evidence a recruiter meets after the summary, and on the printed CV
// it costs about 80pt of a budget that left Nerd Mode 2.5pt: a highlight that repeats the summary spends both. The
// ticket's criterion is that no highlight shares its central claim, subject, number and object, with a sentence of
// the summary. What a check can see of a claim is its number: a figure the summary states and a highlight states
// again is the one claim made twice. The check is that narrow on purpose, the figures and not the sentences, so it
// fails on a repeated "83%" and never on a shared word.
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('config/cv-manifest.json');
const published = Object.values(manifest.profiles).flatMap(({ locales }) => Object.values(locales));

// A year dates a claim, it does not make one: "since 2025" in the summary and "2026:" opening a highlight say when,
// not what. Everything else that carries a digit is a figure, read with the sign that qualifies it, "14%", "1,040",
// "300k", "~30k", "11+", and without the punctuation around it.
const YEAR = /^(?:19|20)\d\d$/;

/** The figures a text states, in order. */
const figuresOf = (text) =>
  String(text ?? '')
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w~]+|[^\w%+]+$/g, ''))
    .filter((token) => /\d/.test(token) && !YEAR.test(token));

/** Every figure of the summary that a career highlight states again, with the highlight that states it. */
const repeated = (profile) => {
  const summary = new Set(figuresOf(profile.profile));
  return (profile.career_highlights || []).flatMap((highlight) =>
    figuresOf(highlight)
      .filter((figure) => summary.has(figure))
      .map((figure) => `${figure} in "${highlight}"`)
  );
};

describe('a career highlight states no figure the summary already states', () => {
  test('a figure is read with its sign and without the punctuation around it, and a year is not a figure', () => {
    expect(
      figuresOf(
        'With 11+ years (300k downloads since release; ~30k by 2026). In 2026: 1,040 → 5,308 tests, 14% → 83%.'
      )
    ).toEqual(['11+', '300k', '~30k', '1,040', '5,308', '14%', '83%']);
  });

  test('the check names each figure a highlight repeats, and passes a highlight that only shares a year', () => {
    const profile = {
      profile:
        'Android again since 2025, on the MDM client: in 2026 grew branch coverage from 14% to 83%.',
      career_highlights: [
        'MDM Android, 2026: 1,040 → 5,308 tests, branch coverage 14% → 83%',
        'Android Enterprise Partner Program certification, 2026'
      ]
    };

    expect(repeated(profile)).toEqual([
      '14% in "MDM Android, 2026: 1,040 → 5,308 tests, branch coverage 14% → 83%"',
      '83% in "MDM Android, 2026: 1,040 → 5,308 tests, branch coverage 14% → 83%"'
    ]);
  });

  test('a profile with no highlights repeats nothing', () => {
    expect(repeated({ profile: 'Grew coverage from 14% to 83%.' })).toEqual([]);
  });

  test.each(published)('%s', (path) => {
    expect(repeated(read(path))).toEqual([]);
  });
});

/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { proseOf } from '../scripts/lib/line-length.mjs';

// The product review of #230 found the published copy departing from #230's own conventions in five places (#262).
// Two of them are a matter of words and were corrected by hand: the work mode, "Remote only", and the interests in
// lower case after the first. The three a check can see are held here: no "&" where the CV writes "and", an acronym
// spelled out at its first use in the prose, and one mark for a rounded count.
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('config/cv-manifest.json');
// English only, as tests/CopyKeepsOneNumberStyle.test.js is: a German CV writes its own words for all three.
const published = Object.values(manifest.profiles).flatMap(({ locales }) =>
  Object.entries(locales)
    .filter(([locale]) => locale === 'en')
    .map(([, path]) => path)
);

/** Every string a profile holds, but its addresses. */
const strings = (node, key = '') =>
  typeof node === 'string'
    ? key === 'url' || key === 'portfolio'
      ? []
      : [node]
    : node && typeof node === 'object'
      ? Object.entries(node).flatMap(([name, value]) => strings(value, name))
      : [];

/**
 * The acronyms a reader of this CV needs no expansion for: the trade's own, and "EU" and "IT". Every other acronym the
 * prose writes is spelled out where it first appears, as "mobile device management (MDM)" is.
 */
const KNOWN = new Set([
  'CI/CD',
  'TDD',
  'UI',
  'UI/UX',
  'API',
  'APIs',
  'IT',
  'EU',
  'CV',
  'NAS',
  'REST'
]);
const ACRONYM = /(?<![\w/])[A-Z]{2,}(?:\/[A-Z]{2,})?s?(?![\w/])/g;

/** Every departure from the conventions, as `what → the rule it breaks`. */
const departures = (profile) => {
  const found = [];
  for (const text of strings(profile)) {
    for (const match of text.match(/\S*\s&\s\S*/g) || []) found.push(`${match} → "and", not "&"`);
    for (const match of text.match(/(?<!~)\b\d+k downloads/g) || []) {
      found.push(`${match} → a rounded count carries "~"`);
    }
  }
  const introduced = new Set();
  for (const text of proseOf(profile)) {
    for (const match of text.matchAll(ACRONYM)) {
      const acronym = match[0];
      if (KNOWN.has(acronym) || introduced.has(acronym)) continue;
      introduced.add(acronym);
      const spelled = text[match.index - 1] === '(' && text[match.index + acronym.length] === ')';
      if (!spelled) found.push(`${acronym} → spelled out at its first use`);
    }
  }
  return found;
};

describe('the copy keeps the conventions #230 settled', () => {
  test('each departure is found, with the rule it breaks', () => {
    expect(
      departures({
        profile: 'Builds its mobile device management (MDM) client; MDM since 2020.',
        career_highlights: ['ezeep Blue: 300k downloads', 'Cortado MDM: ~30k downloads'],
        relevant_experience: [{ highlights: ['Releases; SBOM and security scans.'] }],
        skills: [{ category: 'Architecture & practices', items: [{ name: 'SBOM' }] }],
        social: [{ platform: 'Web', url: 'https://example.com/?a=1&b=2' }]
      })
    ).toEqual([
      '300k downloads → a rounded count carries "~"',
      'Architecture & practices → "and", not "&"',
      'SBOM → spelled out at its first use'
    ]);
  });

  test.each(published)('%s', (path) => {
    expect(departures(read(path))).toEqual([]);
  });

  // The two held by hand, so a later edit that undoes them is seen.
  test.each(published)(
    '%s says "Remote only", and writes its interests in lower case after the first',
    (path) => {
      const profile = read(path);
      expect(profile.availability).toMatch(/^Remote only · /);
      for (const interest of profile.interests.slice(1))
        expect(interest[0]).toBe(interest[0].toLowerCase());
    }
  );
});

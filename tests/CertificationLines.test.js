import { certificationProblems } from '../scripts/lib/certification-lines.mjs';

// The two certifications the general profile carries, and the lines plain `pdftotext` gives for them
// today: the rail's label on a line of its own, then each entry on exactly one line.
const certifications = [
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
];
const android = 'Android Enterprise Expert (incl. Associate, Professional) — Google (2026)';
const ios = 'iOS Lead Essentials (TDD, Clean Architecture) — Essential Developer (2024)';
const extracted = (...lines) =>
  ['German: A1 — currently studying', '', 'Certifications', '', ...lines, '', ''].join('\n');

describe('each certification reaches the text layer as the one line the layout draws', () => {
  test('two entries, each on a line of its own, in the order they were written', () => {
    expect(certificationProblems(extracted(android, ios), certifications)).toEqual([]);
  });

  // The review of #52 measured it: the three-issuer wording of the iOS entry would have run 389.6pt
  // against a 377.3pt column on A4, and wrapped.
  test('an entry that wraps onto a second line', () => {
    const wrapped = extracted(
      android,
      'iOS Lead Essentials (TDD, Clean Architecture) — Essential Developer',
      '(2024)'
    );

    expect(certificationProblems(wrapped, certifications)).toEqual([
      { line: ios, problem: 'not on one line' }
    ]);
  });

  test('an entry that shares its line with something else', () => {
    const shared = extracted(`Certifications ${android}`, ios);

    expect(certificationProblems(shared, certifications)).toEqual([
      { line: android, problem: 'not on one line' }
    ]);
  });

  test('an entry that did not reach the text layer at all', () => {
    expect(certificationProblems(extracted(android), certifications)).toEqual([
      { line: ios, problem: 'missing' }
    ]);
  });

  test('entries in another order than the profile wrote them', () => {
    expect(certificationProblems(extracted(ios, android), certifications)).toEqual([
      { line: ios, problem: 'out of order' }
    ]);
  });

  test('a profile without certifications has nothing to check', () => {
    expect(certificationProblems(extracted(), undefined)).toEqual([]);
  });
});

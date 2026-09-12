/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A claim the CV withdrew came back without anything noticing: the degree the PDF no longer claimed was
// still in six public test fixtures under the candidate's name, and on the page the CV linked to (#50).
// Withdrawing a claim means adding it here, with the reason.
const WITHDRAWN = [
  {
    text: 'M.Sc. Mobile Application',
    reason:
      'The University of Pisa programme is a First Level Professional Master’s Programme, and the ' +
      'issuer does not award it as an M.Sc. (#47).'
  },
  {
    text: 'A2 — currently studying',
    reason: 'German is at A1 (#47).'
  }
];

// Where a withdrawn string may stay, and why.
const EXEMPT = new Map([
  [
    'tests/WithdrawnClaimsStayWithdrawn.test.js',
    'the list itself, which has to name what it looks for'
  ]
]);

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Every withdrawn claim a set of files still makes, as `path: claim`, whatever its case.
 * @param {{ path: string, content: string }[]} files - Text files and what they hold
 * @returns {string[]} The claims found, outside the exemptions
 */
const stillClaimed = (files) =>
  files
    .filter(({ path }) => !EXEMPT.has(path))
    .flatMap(({ path, content }) =>
      WITHDRAWN.filter(({ text }) => content.toLowerCase().includes(text.toLowerCase())).map(
        ({ text }) => `${path}: ${text}`
      )
    );

/**
 * The tracked text files. A binary file is skipped: the PDFs compress their text, so reading their
 * bytes would find nothing, and what they say is audit:pdf's and audit:ats's to check.
 */
const trackedText = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .flatMap((path) => {
      let bytes;
      try {
        bytes = readFileSync(join(root, path));
      } catch {
        return [];
      }
      return bytes.subarray(0, 8000).includes(0) ? [] : [{ path, content: bytes.toString('utf8') }];
    });

describe('a withdrawn claim stays withdrawn', () => {
  test('the check finds one planted in a profile, in any case', () => {
    const planted = [
      {
        path: 'profiles/general/en.json',
        content: '{"degree": "m.sc. mobile applications development"}'
      }
    ];

    expect(stillClaimed(planted)).toEqual(['profiles/general/en.json: M.Sc. Mobile Application']);
  });

  test('every withdrawn claim says why it was withdrawn', () => {
    for (const { reason } of WITHDRAWN) expect(reason.trim()).not.toBe('');
  });

  test('no tracked file makes one outside its exemption', () => {
    const files = trackedText();

    expect(files.length).toBeGreaterThan(100);
    expect(stillClaimed(files)).toEqual([]);
  });
});

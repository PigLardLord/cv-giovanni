/**
 * @jest-environment node
 *
 * The repository says once, and in one voice, what may be reused (#87). `package.json` declared ISC, `npm init`'s
 * default, with no licence text anywhere, and the README once linked a LICENSE file that did not exist. The owner's
 * decision: the code is open, the CV's content is not. So the licence covers the code and names what it does not
 * cover, `package.json` points at it rather than naming a licence that would read as covering everything, and the
 * README says it in a line.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

// What the licence must leave out: the CV itself, and every document made from it.
const CONTENT = ['profiles/', 'profile.webp', 'generated/', 'docs/'];

describe('the licence', () => {
  test('is committed, and grants the ISC permissions', () => {
    expect(existsSync(`${root}LICENSE`)).toBe(true);
    expect(flat(read('LICENSE'))).toMatch(
      /Permission to use, copy, modify, and\/or distribute this software for any purpose/
    );
  });

  test.each(CONTENT)('does not cover %s', (path) => {
    const licence = flat(read('LICENSE'));
    const scope = licence.slice(licence.indexOf('does not cover'));

    expect(licence).toMatch(/does not cover/);
    expect(scope).toContain(`\`${path}\``);
  });

  test('leaves vendored code under its own licence', () => {
    expect(flat(read('LICENSE'))).toMatch(/`vendor\/`[^.]*own licen[cs]e/);
  });

  test('is the one package.json points at, rather than a licence name that would cover everything', () => {
    expect(JSON.parse(read('package.json')).license).toBe('SEE LICENSE IN LICENSE');
    expect(JSON.parse(read('package-lock.json')).packages[''].license).toBe(
      'SEE LICENSE IN LICENSE'
    );
  });

  test('is stated in the README, in one line that links it', () => {
    const lines = read('README.md')
      .split('\n')
      .filter((line) => /\]\(LICENSE\)/.test(line));

    expect(lines).toHaveLength(1);
  });
});

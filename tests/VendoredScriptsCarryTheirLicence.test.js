/**
 * @jest-environment node
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendorDir = join(root, 'vendor');

// i18next and i18next-http-backend are checked in so the page runs off the file tree with no install
// step, and both are MIT. The MIT licence permits that copy on one condition: that the permission
// notice and the copyright notice travel with it. The vendored faces have met the same obligation for
// the SIL OFL since #61, each family beside its LICENSE and a test that says so; the scripts were
// committed with neither (#224).
//
// All three sentences are required, and the middle one is the licence itself: a file holding only the
// clause that *refers* to the permission notice carries no permission at all.
const GRANT = /permission is hereby granted, free of charge/i;
const NOTICE =
  /above copyright notice and this permission notice( \(including the next paragraph\))? shall be included/i;
// A holder, not a year: React's line is "Copyright (c) Meta Platforms, Inc. and affiliates.", lodash's
// names a foundation and a URL, and hundreds of packages carry a name and an email. Demanding a year
// would call those licences counterfeit, and the cheap way out would be editing a vendored licence —
// the one thing this file exists to prevent. Which holder it must be is the registry's to say.
//
// A line of its own, and read unnormalised, because the word also stands inside the condition above:
// matched against the whole licence run together, "the above copyright notice" is a copyright line,
// and a file stripped of its real one would pass on the strength of the sentence naming it.
const COPYRIGHT = /^[ \t]*copyright\b[^\n]*\S/im;

/** A licence as a matcher reads it: one line, so a sentence broken across lines still matches. */
const asOneLine = (text) => text.replace(/\s+/gu, ' ');

/** Whether a text is the MIT licence: the grant, the condition, and a copyright line naming a holder. */
const isMit = (text) =>
  [GRANT, NOTICE].every((sentence) => sentence.test(asOneLine(text))) && COPYRIGHT.test(text);

// Named, not discovered. A directory scan asks what the packager happened to put at depth one — an
// `.mjs`, a `build/` subdirectory or a vendored stylesheet would each be scanned by nobody — where the
// obligation is about what the repository redistributes. So the registry is the check: a vendored
// directory that appears here unregistered fails, and one that vanishes fails too.
const SCRIPTS = {
  i18next: { script: 'i18next.js', copyright: 'Copyright (c) 2011-present i18next' },
  'i18next-http-backend': { script: 'index.js', copyright: 'Copyright (c) 2020-present i18next' }
};

/** The directory `tests/FontsAreSelfHosted.test.js` owns; its families carry the OFL, not the MIT. */
const FACES = 'fonts';

/** The licence file of a vendored directory, whichever way the package spells it, or undefined. */
const licenceOf = (directory) =>
  readdirSync(join(vendorDir, directory)).find((file) => /^licen[cs]e/i.test(file));

const licenceTextOf = (directory) =>
  readFileSync(join(vendorDir, directory, licenceOf(directory)), 'utf8');

describe('the vendored scripts carry the licence they are redistributed under', () => {
  // The check has to be able to fail, and these are the shapes it was written for.
  test('a text is the MIT licence only with the grant, the condition and a copyright line', () => {
    const mit = licenceTextOf('i18next');
    expect(isMit(mit)).toBe(true);

    // The clause naming the permission notice is not the permission notice.
    expect(
      isMit(
        'Copyright (c) 2011-present i18next\n\nThe above copyright notice and this\npermission notice shall be included in all copies.'
      )
    ).toBe(false);
    expect(isMit(mit.replace(/Copyright \(c\)[^\n]*/i, ''))).toBe(false);

    // ISC conditions redistribution on the copyright notice alone and grants permission in its own
    // words, so it is not this licence and must not pass as one.
    expect(
      isMit(
        'ISC License\n\nCopyright (c) 2026 Someone\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.'
      )
    ).toBe(false);

    // The copyright lines real MIT files carry. A matcher demanding a year calls six of these
    // counterfeit — React's names no year, lodash's names a foundation and a URL — and the cheap way
    // out of a red build would be editing the vendored licence, which is what this file prevents.
    const rest = mit.replace(/^[ \t]*copyright\b[^\n]*/im, '');
    for (const line of [
      'Copyright (c) Meta Platforms, Inc. and affiliates.',
      'Copyright (c) Microsoft Corporation.',
      'Copyright OpenJS Foundation and other contributors <https://openjsf.org/>',
      'Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)',
      'Copyright (c) Someone, 2020',
      'Copyright(c) 2020',
      'Copyright © 2020 Someone'
    ]) {
      expect([line, isMit(`${line}\n${rest}`)]).toEqual([line, true]);
    }
    // Windows line endings are a licence too.
    expect(isMit(mit.replace(/\n/gu, '\r\n'))).toBe(true);
    // A word is not a holder.
    expect(isMit(`Copyright\n${rest}`)).toBe(false);
  });

  test('vendor/ holds the registered scripts, the faces, and nothing unaccounted for', () => {
    // Every entry, not every directory: a script dropped loose at vendor/ root is redistributed the
    // same way and carries the same obligation, and a check that only reads directories never sees it.
    expect(readdirSync(vendorDir).sort()).toEqual([FACES, ...Object.keys(SCRIPTS)].sort());
  });

  // The copyright line is what tells one package's licence from another's: two MIT files differ in
  // little else, and a licence pasted from the wrong package would otherwise read as correct.
  // The registry carries the identity check, so the registry is checked too: an entry whose copyright
  // line was copied as a bare holder name, or left empty, would let two packages from one organisation
  // stand in for each other and the swap would go unseen.
  test('every registered copyright line is a copyright line, and its own', () => {
    const lines = Object.values(SCRIPTS).map(({ copyright }) => copyright);
    lines.forEach((line) => expect(line).toMatch(/^Copyright\b.*\S/));
    expect(new Set(lines).size).toBe(lines.length);
  });

  test.each(Object.entries(SCRIPTS))(
    'vendor/%s carries its script and its own licence',
    (directory, { script, copyright }) => {
      expect(readdirSync(join(vendorDir, directory))).toContain(script);
      expect(licenceOf(directory)).toBeDefined();
      const licence = licenceTextOf(directory);
      expect(isMit(licence)).toBe(true);
      expect(asOneLine(licence)).toContain(copyright);
    }
  );
});

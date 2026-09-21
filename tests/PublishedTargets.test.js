/**
 * @jest-environment node
 */
import { GenerationTarget } from '../core/GenerationTarget.js';
import {
  eachPublished,
  namesProfile,
  releasedAcross,
  unlistedProfile
} from '../scripts/lib/published-targets.mjs';

// CI ran `npm run build:pdf` and the audits with no --profile, which meant the one CV whose path was written into
// the code. A second locale listed in the manifest was printed by nobody and audited by nobody, and its page hid
// the download, because generated/manifest.json never named its file (#248).
const manifest = {
  profiles: {
    general: { locales: { en: 'profiles/general/en.json', de: 'profiles/general/de.json' } }
  }
};
const targets = GenerationTarget.published(manifest);

describe('a run with no --profile', () => {
  test('is a run over the published CVs, and one that names a profile is not', () => {
    expect(namesProfile([])).toBe(false);
    expect(namesProfile(['--out=x'])).toBe(false);
    expect(namesProfile(['--profile=profiles/general/de.json'])).toBe(true);
  });

  test('runs the script once per published CV, in turn, naming each and printing into generated/', () => {
    const calls = [];
    const run = (_node, args) => {
      calls.push(args);
      return { status: 0 };
    };

    expect(eachPublished('scripts/audit-print.mjs', targets, ['--quiet'], run)).toBe(0);
    expect(calls).toEqual([
      [
        'scripts/audit-print.mjs',
        '--profile=profiles/general/en.json',
        '--out=generated',
        '--quiet'
      ],
      [
        'scripts/audit-print.mjs',
        '--profile=profiles/general/de.json',
        '--out=generated',
        '--quiet'
      ]
    ]);
  });

  // One CV failing fails the run, and a run that checked nothing must never read as a pass: 2 outranks 1.
  test('ends on the worst exit any of them had', () => {
    const exits = (...codes) => {
      let next = 0;
      return () => ({ status: codes[next++] });
    };

    expect(eachPublished('s.mjs', targets, [], exits(0, 1))).toBe(1);
    expect(eachPublished('s.mjs', targets, [], exits(2, 1))).toBe(2);
    // A child killed by a signal has no status: it did not finish, so it did not pass.
    expect(eachPublished('s.mjs', targets, [], exits(0, null))).toBe(2);
  });

  test('checks nothing, and says so, when the manifest publishes nothing', () => {
    expect(eachPublished('s.mjs', [], [], () => ({ status: 0 }))).toBe(2);
  });
});

describe('what the page may offer', () => {
  // The page offers a download only for a file generated/manifest.json names. Each CV's run wrote its own list
  // over the last one's, so after two runs the page offered the second locale and hid the first.
  test('is every file every published CV printed, in one list', () => {
    const data = { name: 'Ada Lovelace' };
    const released = releasedAcross(targets, () => data, ['nerd', 'technical']);

    expect(released).toEqual([
      'ada-lovelace-general-en-nerd.pdf',
      'ada-lovelace-general-en-technical.pdf',
      'ada-lovelace-general-de-nerd.pdf',
      'ada-lovelace-general-de-technical.pdf'
    ]);
  });
});

describe('a profile under profiles/ that the manifest does not list', () => {
  // The page refuses a profile the manifest does not list, so the print waited 30 seconds for a page that had
  // already thrown "Profile general is not available in de" and then failed on a timeout that named neither.
  test('is refused up front, with the file that would publish it', () => {
    const only = GenerationTarget.published({
      profiles: { general: { locales: { en: 'profiles/general/en.json' } } }
    });
    const message = unlistedProfile(['--profile=profiles/general/de.json'], only);

    expect(message).toMatch(/profiles\/general\/de\.json/);
    expect(message).toMatch(/config\/cv-manifest\.json/);
  });

  test('is no concern for a listed profile, a tailored one, or a run that names none', () => {
    expect(unlistedProfile(['--profile=profiles/general/de.json'], targets)).toBeNull();
    expect(unlistedProfile(['--profile=applications/acme/en.json'], targets)).toBeNull();
    expect(unlistedProfile([], targets)).toBeNull();
  });
});

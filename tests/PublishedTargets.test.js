/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { GenerationTarget } from '../core/GenerationTarget.js';
import {
  eachPublished,
  namesProfile,
  releasedAcross,
  resolveRun,
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

// Every script opens the same way, and the four copies of that opening had already drifted: two refused an unlisted
// profile and two did not (the review of #248). One function decides what a run is about.
describe('what a run is about', () => {
  const quiet = { say: () => {} };
  const reads = (value) => async () => value;

  test('is the one CV --profile names, when the manifest lists it', async () => {
    const run = await resolveRun('audit-print', 's.mjs', ['--profile=profiles/general/de.json'], {
      ...quiet,
      readManifest: reads(manifest)
    });
    expect(run.target.dataPath).toBe('profiles/general/de.json');
  });

  test('is nothing, said, for a profile under profiles/ the manifest does not list', async () => {
    const said = [];
    const run = await resolveRun('audit-print', 's.mjs', ['--profile=profiles/general/it.json'], {
      say: (line) => said.push(line),
      readManifest: reads(manifest)
    });
    expect(run).toEqual({ exit: 2 });
    expect(said.join(' ')).toMatch(/config\/cv-manifest\.json/);
  });

  // "./profiles/…" is the same file, and it walked past the refusal into a 30-second wait for a page that had
  // already thrown.
  test('reads a path that opens on ./ as the path it is', async () => {
    const run = await resolveRun(
      'generate-pdfs',
      's.mjs',
      ['--profile=./profiles/general/it.json'],
      {
        ...quiet,
        readManifest: reads(manifest)
      }
    );
    expect(run).toEqual({ exit: 2 });
  });

  // A tailored build has nothing to do with the manifest, and a manifest mistake must not stop it.
  test('does not read the manifest for a tailored profile', async () => {
    const run = await resolveRun(
      'generate-pdfs',
      's.mjs',
      ['--profile=applications/acme/en.json'],
      {
        ...quiet,
        readManifest: async () => {
          throw new Error('read');
        }
      }
    );
    expect(run.target.dataPath).toBe('applications/acme/en.json');
  });

  test('is nothing, said, when the manifest cannot be read, rather than a stack trace', async () => {
    const said = [];
    const run = await resolveRun('audit-ats', 's.mjs', [], {
      say: (line) => said.push(line),
      readManifest: reads({
        profiles: { general: { locales: { de: 'profiles/general/en.json' } } }
      })
    });
    expect(run).toEqual({ exit: 2 });
    expect(said.join(' ')).toMatch(/must agree/);
  });

  // --out names where one CV goes. Without --profile the combined download list was still written into
  // generated/, over what the page reads, for PDFs printed somewhere else.
  test('is nothing, said, for --out without the CV it would apply to', async () => {
    const run = await resolveRun('generate-pdfs', 's.mjs', ['--out=build'], {
      ...quiet,
      readManifest: reads(manifest)
    });
    expect(run).toEqual({ exit: 2 });
  });

  test('with no --profile is every published CV, in turn, wrapped as the caller asks', async () => {
    const calls = [];
    let wrapped;
    const run = await resolveRun('audit-print', 's.mjs', [], {
      ...quiet,
      readManifest: reads(manifest),
      run: (_node, args) => {
        calls.push(args[1]);
        return { status: 0 };
      },
      around: async (printAll, published) => {
        wrapped = published.length;
        return printAll();
      }
    });
    expect(run).toEqual({ exit: 0 });
    expect(calls).toEqual([
      '--profile=profiles/general/en.json',
      '--profile=profiles/general/de.json'
    ]);
    expect(wrapped).toBe(2);
  });
});

// Every published CV prints into generated/, so an audit that picks its PDFs by listing that directory grades every
// locale against one profile. audit-ats did: with German listed, the English report fell from 80/80 to 63.2 and
// graded "Bad Liebenstein, Thüringen, Deutschland" as a wrong location for a CV nothing had changed (the review of
// #248). An audit asks the naming rule which files are its CV's, and lists a directory only for its own scratch
// files — audit-print reads the page images it rasterised itself.
describe('an audit reads only the CV it is about', () => {
  const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  test.each(['scripts/audit-print.mjs', 'scripts/audit-ats.mjs'])(
    '%s chooses its PDFs by the CV, not by listing a directory',
    (path) => {
      const script = source(path);
      expect(script).toMatch(/builtCv\(target,/);
      // The one directory an audit may list is its own scratch space, which audit-print calls `directory`.
      const listed = [...script.matchAll(/readdir\(([^)]*)\)/g)].map(([, what]) => what.trim());
      expect(listed.filter((what) => what !== 'directory')).toEqual([]);
    }
  );
});

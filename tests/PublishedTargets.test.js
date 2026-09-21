/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { GenerationTarget } from '../core/GenerationTarget.js';
import {
  eachPublished,
  namesProfile,
  printedDownloadList,
  releasedAcross,
  resolveRun,
  unlistedProfile
} from '../scripts/lib/published-targets.mjs';
import { auditedFiles } from '../scripts/lib/printed-cv.mjs';

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

  // Written either way: with a space, "--profile" used to be read as naming nothing and the run built the
  // public CV instead (#258).
  test.each([
    [['--profile=profiles/general/de.json']],
    [['--profile', 'profiles/general/de.json']]
  ])('is the one CV --profile names, when the manifest lists it: %j', async (argv) => {
    const run = await resolveRun('audit-print', 's.mjs', argv, {
      ...quiet,
      readManifest: reads(manifest)
    });
    expect(run.target.dataPath).toBe('profiles/general/de.json');
    expect(run.manifest).toBe(manifest);
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

  // A tailored build reads the manifest for its layouts, like any other, but it is not published: a mistake in
  // the list of published CVs must not stop it.
  test('lets a tailored profile through a manifest whose published list is wrong', async () => {
    const run = await resolveRun(
      'generate-pdfs',
      's.mjs',
      ['--profile=applications/acme/en.json'],
      {
        ...quiet,
        readManifest: reads({
          layouts: ['nerd'],
          profiles: { general: { locales: { de: 'profiles/general/en.json' } } }
        })
      }
    );
    expect(run.target.dataPath).toBe('applications/acme/en.json');
    expect(run.manifest.layouts).toEqual(['nerd']);
  });

  // Every script needs the layouts, so a manifest that does not parse stops every run — with a sentence naming
  // the file and exit 2, never the stack trace a second read of it used to end on.
  test.each([[[]], [['--profile=applications/acme/en.json']]])(
    'is nothing, said, naming the file, when the manifest does not parse (%j)',
    async (argv) => {
      const said = [];
      const run = await resolveRun('generate-pdfs', 's.mjs', argv, {
        say: (line) => said.push(line),
        readManifest: async () => JSON.parse('{ not json')
      });
      expect(run).toEqual({ exit: 2 });
      expect(said.join(' ')).toMatch(/config\/cv-manifest\.json cannot be read/);
    }
  );

  // With nothing published, the build's wrapper used to run anyway and crash on the first CV that was not there.
  test('is nothing, said, when the manifest publishes no CV, and nothing around the run is started', async () => {
    let started = false;
    const run = await resolveRun('generate-pdfs', 's.mjs', [], {
      ...quiet,
      readManifest: reads({ profiles: {} }),
      around: async () => {
        started = true;
        return 0;
      }
    });
    expect(run).toEqual({ exit: 2 });
    expect(started).toBe(false);
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

  // A malformed --profile threw from the argument parser and ended the run on a stack trace (#258).
  test.each([[['--profile']], [['--profile=en.json']]])(
    'is nothing, said, for a --profile that names no CV: %j',
    async (argv) => {
      const said = [];
      const run = await resolveRun('generate-pdfs', 's.mjs', argv, {
        say: (line) => said.push(line),
        readManifest: reads(manifest)
      });
      expect(run).toEqual({ exit: 2 });
      expect(said.join(' ')).toMatch(/--profile/);
    }
  );

  // An audit's own option with no value is refused once, before any CV starts, not once by each (#272).
  test('is nothing, said once, for an option with no value, and no CV starts', async () => {
    const said = [];
    const started = [];
    const run = await resolveRun('audit-ats', 's.mjs', ['--advert'], {
      say: (line) => said.push(line),
      readManifest: reads(manifest),
      run: (_node, args) => {
        started.push(args);
        return { status: 0 };
      }
    });
    expect(run).toEqual({ exit: 2 });
    expect(said).toEqual([
      expect.stringMatching(/^audit-ats: --advert needs a value: --advert=<path>/)
    ]);
    expect(started).toEqual([]);
  });

  // A tailoring job prints and audits its CV in the one layout it was asked for (#303); a published CV keeps every
  // layout the page offers, since its build writes the page's downloads and its audits the reports in docs/.
  const laidOut = { ...manifest, layouts: ['nerd', 'spotlight', 'technical'] };

  test('with --layout, a tailored CV is read in that layout alone', async () => {
    const run = await resolveRun(
      'audit-print',
      's.mjs',
      ['--profile=applications/20260921-143205-a1b2c3/en.json', '--layout', 'technical'],
      { ...quiet, readManifest: reads(laidOut) }
    );
    expect(run.manifest.layouts).toEqual(['technical']);
    expect(run.target.dataPath).toBe('applications/20260921-143205-a1b2c3/en.json');
  });

  test.each([
    [['--profile=applications/x/en.json', '--layout=modern'], /not a layout the manifest lists/],
    [['--layout=technical'], /one layout of a tailored CV/],
    [['--profile=profiles/general/en.json', '--layout=technical'], /one layout of a tailored CV/],
    [['--profile=applications/x/en.json', '--layout'], /--layout needs a value/],
    // A --profile that names no CV is refused for itself, not for its layout.
    [['--profile=en.json', '--layout=technical'], /--profile must name a file/]
  ])('%j is refused', async (argv, reason) => {
    const said = [];
    const started = [];
    const run = await resolveRun('generate-pdfs', 's.mjs', argv, {
      say: (line) => said.push(line),
      readManifest: reads(laidOut),
      run: (_node, args) => {
        started.push(args);
        return { status: 0 };
      }
    });
    expect(run).toEqual({ exit: 2 });
    expect(said.join(' ')).toMatch(reason);
    expect(started).toEqual([]);
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
      around: async (printAll, published, read) => {
        wrapped = [published.length, read === manifest];
        return printAll();
      }
    });
    expect(run).toEqual({ exit: 0 });
    expect(calls).toEqual([
      '--profile=profiles/general/en.json',
      '--profile=profiles/general/de.json'
    ]);
    expect(wrapped).toEqual([2, true]);
  });
});

// Every published CV prints into generated/, so an audit that picks its PDFs by listing that directory grades every
// locale against one profile. audit-ats did: with German listed, the English report fell from 80/80 to 63.2 and
// graded "Bad Liebenstein, Thüringen, Deutschland" as a wrong location for a CV nothing had changed (the review of
// #248). The files an audit reads are the ones the naming rule gives its own CV.
describe('the files an audit reads', () => {
  const data = { name: 'Ada Lovelace' };
  const [en, de] = targets;
  const everythingIsThere = () => true;

  test("are the CV's own, however many other CVs share the directory", () => {
    expect(auditedFiles(en, data, ['nerd', 'technical'], everythingIsThere)).toEqual([
      { path: 'generated/ada-lovelace-general-en-nerd.pdf', isCover: false },
      { path: 'generated/ada-lovelace-general-en-technical.pdf', isCover: false }
    ]);
    expect(auditedFiles(de, data, ['nerd'], everythingIsThere)).toEqual([
      { path: 'generated/ada-lovelace-general-de-nerd.pdf', isCover: false }
    ]);
  });

  test('are only the ones on disk, with a letter beside each CV when the profile carries one', () => {
    const letter = { ...data, letter: { recipient: { company: 'Acme' } } };
    const onDisk = (path) =>
      !path.endsWith('technical.pdf') && !path.endsWith('technical-cover.pdf');
    expect(auditedFiles(en, letter, ['nerd', 'technical'], onDisk)).toEqual([
      { path: 'generated/ada-lovelace-general-en-nerd-cover.pdf', isCover: true },
      { path: 'generated/ada-lovelace-general-en-nerd.pdf', isCover: false }
    ]);
  });

  test('are the ones audit-ats reads', () => {
    expect(readFileSync(new URL('../scripts/audit-ats.mjs', import.meta.url), 'utf8')).toMatch(
      /auditedFiles\(target,/
    );
  });
});

// Each CV's build writes the download list for its own files over the last one's. The list the page reads is
// written once, after every CV has printed; if one failed, the list is put back exactly as it was, or left absent
// if there was none — otherwise the page would offer whichever CV happened to print last. The first version of
// #248 claimed this and did not do it, so it is held here and not only in a sentence.
describe('the download list a run over every published CV leaves', () => {
  const store = (initial) => {
    const state = { text: initial, removed: false };
    return {
      state,
      read: async () => state.text,
      write: async (text) => {
        state.text = text;
      },
      remove: async () => {
        state.text = null;
        state.removed = true;
      }
    };
  };
  const union = async () => ['a.pdf', 'b.pdf'];

  test('is every file every CV printed, when they all printed', async () => {
    const list = store('{"released":["old.pdf"]}\n');
    expect(await printedDownloadList(() => 0, { ...list, union })).toBe(0);
    expect(JSON.parse(list.state.text)).toEqual({ released: ['a.pdf', 'b.pdf'] });
  });

  test('is the list as it was before the run, byte for byte, when one CV failed', async () => {
    const before = '{\n  "released": ["kept.pdf"]\n}\n';
    const list = store(before);
    const printAll = async () => {
      await list.write('{"released":["half.pdf"]}\n');
      return 1;
    };
    expect(await printedDownloadList(printAll, { ...list, union })).toBe(1);
    expect(list.state.text).toBe(before);
  });

  test('is no list at all, when there was none and one CV failed', async () => {
    const list = store(null);
    const printAll = async () => {
      await list.write('{"released":["half.pdf"]}\n');
      return 2;
    };
    expect(await printedDownloadList(printAll, { ...list, union })).toBe(2);
    expect(list.state).toEqual({ text: null, removed: true });
  });
});

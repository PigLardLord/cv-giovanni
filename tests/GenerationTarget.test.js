import { GenerationTarget } from '../core/GenerationTarget.js';

describe('GenerationTarget', () => {
  test('with no arguments it is the public CV, unchanged', () => {
    const target = GenerationTarget.fromArguments([]);

    expect(target.dataPath).toBe('profiles/general/en.json');
    expect(target.profile).toBe('general');
    expect(target.locale).toBe('en');
    expect(target.outDir).toBe('generated');
  });

  // profile and locale are read from the path rather than passed separately: a CV is
  // profile x locale x layout, and the first two are already in <root>/<profile>/<locale>.json.
  // Passing them twice is passing them differently, eventually.
  test('the profile and the locale come from the path', () => {
    const target = GenerationTarget.fromArguments(['--profile=applications/act-ai/de.json']);

    expect(target.profile).toBe('act-ai');
    expect(target.locale).toBe('de');
  });

  // The hazard this exists to prevent: a tailored CV written into generated/, which is
  // tracked and published. The default output follows the profile it was built from.
  test('a tailored profile writes beside itself, never into the published directory', () => {
    const target = GenerationTarget.fromArguments(['--profile=applications/act-ai/en.json']);

    expect(target.outDir).toBe('applications/act-ai/out');
  });

  test('an explicit output directory wins', () => {
    const target = GenerationTarget.fromArguments([
      '--profile=applications/act-ai/en.json',
      '--out=/tmp/x'
    ]);

    expect(target.outDir).toBe('/tmp/x');
  });

  test('the manifest sits under the output directory', () => {
    const target = GenerationTarget.fromArguments(['--out=build']);

    expect(target.manifestPath).toBe('build/manifest.json');
  });

  // The committed matrix must describe the CV that ships, not whichever application was
  // audited last. Auditing a tailored profile writes its report beside that profile.
  test('a report lands in docs/ only for the published CV', () => {
    expect(GenerationTarget.fromArguments([]).reportPath('PRINT_AUDIT.md')).toBe(
      'docs/PRINT_AUDIT.md'
    );
    expect(
      GenerationTarget.fromArguments(['--profile=applications/act-ai/en.json']).reportPath(
        'PRINT_AUDIT.md'
      )
    ).toBe('applications/act-ai/out/PRINT_AUDIT.md');
  });

  // A CV is published because the manifest lists it, not because its path matches one written into the code: a
  // second locale listed there was built by nobody and audited by nobody, and its page hid the download (#248).
  describe('the published CVs', () => {
    const manifest = {
      profiles: {
        general: { locales: { en: 'profiles/general/en.json', de: 'profiles/general/de.json' } }
      }
    };

    test('are every profile and locale the manifest lists, each printed into generated/', () => {
      const targets = GenerationTarget.published(manifest);

      expect(
        targets.map(({ dataPath, profile, locale, outDir }) => [dataPath, profile, locale, outDir])
      ).toEqual([
        ['profiles/general/en.json', 'general', 'en', 'generated'],
        ['profiles/general/de.json', 'general', 'de', 'generated']
      ]);
      expect(targets.every((target) => target.isPublished)).toBe(true);
    });

    test('are none for a manifest that lists none', () => {
      expect(GenerationTarget.published({ profiles: {} })).toEqual([]);
      expect(GenerationTarget.published({})).toEqual([]);
    });

    // The manifest says the profile and the locale twice, as its keys and in the path. Two ways of saying the
    // same thing eventually say different things, and the filename would be the one that lies.
    test('refuse a manifest whose keys disagree with the path they point at', () => {
      expect(() =>
        GenerationTarget.published({
          profiles: { general: { locales: { de: 'profiles/general/en.json' } } }
        })
      ).toThrow(/de.*en|en.*de/);
    });

    // The committed matrix describes what ships. The first published CV keeps the report names it always had;
    // every other one is named for itself, so two published CVs never write over each other's report.
    test('each write a report of their own into docs/', () => {
      const [en, de] = GenerationTarget.published(manifest);

      expect(en.reportPath('PRINT_AUDIT.md')).toBe('docs/PRINT_AUDIT.md');
      expect(de.reportPath('PRINT_AUDIT.md')).toBe('docs/PRINT_AUDIT.general-de.md');
    });

    test('a tailored profile stays unpublished even when its path names a listed locale', () => {
      expect(
        GenerationTarget.fromArguments(['--profile=applications/act-ai/de.json']).isPublished
      ).toBe(false);
    });
  });

  // "--profile profiles/general/de.json", with a space, built the English CV and said nothing: the parser read only
  // "--name=value", found "--profile" with no value, and fell back to the public CV. So did "--profile" alone and
  // "--profile=". A run that checks something other than what it was asked about must never read as a pass (#258).
  describe('an option written the other way', () => {
    test('as two tokens is read as the one it is', () => {
      const target = GenerationTarget.fromArguments([
        '--profile',
        'profiles/general/de.json',
        '--out',
        'build'
      ]);

      expect([target.dataPath, target.locale, target.outDir]).toEqual([
        'profiles/general/de.json',
        'de',
        'build'
      ]);
    });

    test.each([[['--profile']], [['--profile=']], [['--profile', '--out=build']], [['--out']]])(
      'with no value, %j is refused rather than read as the public CV',
      (argv) => {
        expect(() => GenerationTarget.fromArguments(argv)).toThrow(/needs a value/);
      }
    );
  });

  // A path that does not name a profile and a locale would produce filenames nobody can
  // trace back to a CV. Refusing is cheaper than a directory of mislabelled PDFs.
  test.each([
    ['en.json', 'no profile directory'],
    ['profiles/general/', 'no locale'],
    ['profiles/general/en.txt', 'not JSON']
  ])('refuses %s', (path) => {
    expect(() => GenerationTarget.fromArguments([`--profile=${path}`])).toThrow(/profile/i);
  });
});

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

  test('the QA variants and the manifest sit under the output directory', () => {
    const target = GenerationTarget.fromArguments(['--out=build']);

    expect(target.qaDir).toBe('build/qa');
    expect(target.manifestPath).toBe('build/manifest.json');
  });

  // The committed matrix must describe the CV that ships, not whichever application was
  // audited last. Auditing a tailored profile writes its report beside that profile.
  test('a report lands in docs/ only for the published CV', () => {
    expect(GenerationTarget.fromArguments([]).reportPath('PDF_AUDIT.md')).toBe('docs/PDF_AUDIT.md');
    expect(
      GenerationTarget.fromArguments(['--profile=applications/act-ai/en.json']).reportPath(
        'PDF_AUDIT.md'
      )
    ).toBe('applications/act-ai/out/PDF_AUDIT.md');
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

/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// A page that asks Google for its fonts hands Google every visitor's IP address before anyone has
// consented, and Landgericht München I held exactly that to be an unlawful transfer (3 O 17493/20).
// The faces are served from vendor/fonts/ instead (#61), and this file keeps them there.
const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/;

/** The faces the page requested from Google, and so the ones it must still find. */
const FACES = {
  Inter: [300, 400, 500, 600, 700],
  'JetBrains Mono': [400, 500, 700],
  'Instrument Serif': [400]
};

const fontsDir = join(root, 'vendor', 'fonts');
const stylesheet = join(fontsDir, 'fonts.css');

/** Every file the page can load, tracked or about to be: markup, styles and scripts. */
const shipped = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8'
})
  .split('\n')
  .filter((file) => /\.(html|css|m?js)$/.test(file) && !file.startsWith('tests/'))
  .filter((file) => existsSync(join(root, file)));

/** The @font-face blocks of the vendored stylesheet, one object per block. */
function declaredFaces() {
  const css = readFileSync(stylesheet, 'utf8');
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, block]) => ({
    family: block.match(/font-family:\s*'([^']+)'/)?.[1],
    weight: Number(block.match(/font-weight:\s*(\d+)/)?.[1]),
    style: block.match(/font-style:\s*(\w+)/)?.[1],
    urls: [...block.matchAll(/url\('?([^')]+)'?\)/g)].map(([, url]) => url),
    unicodeRange: block.match(/unicode-range:\s*([^;]+);/)?.[1]
  }));
}

describe('the page asks nobody else for its fonts', () => {
  // The check has to be able to fail, and these are the three shapes it was written for.
  test('a Google Fonts stylesheet, preconnect or import is recognised', () => {
    expect(GOOGLE_FONTS.test('<link href="https://fonts.googleapis.com/css2?family=Inter">')).toBe(
      true
    );
    expect(GOOGLE_FONTS.test('<link rel="preconnect" href="https://fonts.gstatic.com" />')).toBe(
      true
    );
    expect(GOOGLE_FONTS.test("@import url('https://fonts.googleapis.com/css2?family=X');")).toBe(
      true
    );
    expect(GOOGLE_FONTS.test('<link rel="stylesheet" href="vendor/fonts/fonts.css" />')).toBe(
      false
    );
  });

  test('no page, stylesheet or script references Google Fonts', () => {
    const offenders = shipped.filter((file) =>
      GOOGLE_FONTS.test(readFileSync(join(root, file), 'utf8'))
    );
    expect(shipped.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  test('the page loads the vendored faces', () => {
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toMatch(
      /href="vendor\/fonts\/fonts\.css[?"]/
    );
  });
});

describe('the vendored faces are the ones the page used', () => {
  test('every family and weight the page requested is declared, and nothing else', () => {
    const faces = declaredFaces();
    const declared = {};
    for (const face of faces) {
      expect(face.style).toBe('normal');
      declared[face.family] = [...new Set([...(declared[face.family] || []), face.weight])].sort(
        (a, b) => a - b
      );
    }
    expect(declared).toEqual(FACES);
  });

  // Two blocks for one family, weight and style are two subsets of it. Without a unicode-range the
  // later block wins for every character, and a subset that lacks the basic Latin letters renders
  // the whole page in the fallback face.
  test('every face split into subsets says which characters each subset covers', () => {
    expect(declaredFaces().filter((face) => !face.unicodeRange)).toEqual([]);
  });

  test('every file a face points at is on disk', () => {
    const missing = declaredFaces()
      .flatMap((face) => face.urls)
      .filter((url) => !existsSync(join(dirname(stylesheet), url)));
    expect(missing).toEqual([]);
  });

  test('every vendored family carries its licence', () => {
    const families = readdirSync(fontsDir).filter((entry) =>
      statSync(join(fontsDir, entry)).isDirectory()
    );
    const unlicensed = families.filter((family) => {
      const licence = readdirSync(join(fontsDir, family)).find((file) => /^LICENSE/.test(file));
      return (
        !licence ||
        !/SIL Open Font License/.test(readFileSync(join(fontsDir, family, licence), 'utf8'))
      );
    });
    expect(families.length).toBeGreaterThanOrEqual(3);
    expect(unlicensed).toEqual([]);
  });
});

/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// README.md described `cv-data.json`, `profile.png` and a data flow three refactors old, for months,
// and nothing noticed: it is the first file a visitor to a CV's repository opens (#29). What it names
// can at least be checked — every path it puts in code exists, or git ignores it on purpose, and every
// `npm run` script it names is one package.json defines.
const root = fileURLToPath(new URL('..', import.meta.url));
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;

/** Inline code that reads as a path here: a slash or a file extension, no placeholder, no address. */
const namedPaths = (markdown) => [
  ...new Set(
    [...markdown.matchAll(/`([^`\n]+)`/g)]
      .map(([, code]) => code.trim())
      .filter((code) => /^[\w.@-]+(\/[\w.@-]*)*$/.test(code))
      .filter(
        (code) =>
          code.includes('/') ||
          /\.(js|mjs|cjs|json|css|html|md|png|jpe?g|webp|svg|pdf|ya?ml|sh|txt)$/.test(code)
      )
  )
];
const namedScripts = (markdown) => [
  ...new Set([...markdown.matchAll(/npm run ([\w:-]+)/g)].map(([, name]) => name))
];
const ignoredOnPurpose = (path) => {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: root });
    return true;
  } catch {
    return false;
  }
};
const missing = (paths) =>
  paths.filter((path) => !existsSync(join(root, path)) && !ignoredOnPurpose(path));

describe('README.md names what the repository has', () => {
  test('the check finds a path that is not there, and a script package.json does not define', () => {
    const stale =
      'Content lives in `cv-data.json`, loaded by `core/DataLoader.js`; run `npm run deploy`.';

    expect(missing(namedPaths(stale))).toEqual(['cv-data.json']);
    expect(namedScripts(stale).filter((name) => !scripts[name])).toEqual(['deploy']);
  });

  test('every path it names exists, or is ignored on purpose', () => {
    expect(missing(namedPaths(readme))).toEqual([]);
  });

  test('every npm script it names is defined', () => {
    expect(namedScripts(readme).filter((name) => !scripts[name])).toEqual([]);
  });
});

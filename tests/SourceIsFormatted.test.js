/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const prettier = join(root, 'node_modules', '.bin', 'prettier');
const config = join(root, '.prettierrc.json');

/** `prettier --check`, reporting rather than throwing, so a failure can name the files. */
function check(args) {
  try {
    execFileSync(prettier, ['--check', ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

/** A file outside the repository, checked against the repository's own configuration. */
function checkSnippet(source) {
  const dir = mkdtempSync(join(tmpdir(), 'formatting-'));
  const file = join(dir, 'snippet.js');
  writeFileSync(file, source);
  try {
    return check(['--config', config, file]).ok;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('layout belongs to Prettier', () => {
  // The check has to be able to fail, and this pair is where that is proved: without it, a check
  // that ran nothing — a missing binary, an ignore file that swallowed the tree — would pass the
  // repository test below on any code at all.
  test('a mis-indented file fails the check', () => {
    expect(checkSnippet('export function f() {\n      return 1;\n}\n')).toBe(false);
  }, 30000);

  test('the same file, indented, passes', () => {
    expect(checkSnippet('export function f() {\n  return 1;\n}\n')).toBe(true);
  }, 30000);

  // The file list is in the failure message: run `npm run format` and commit the result.
  test('every file in the repository is formatted', () => {
    expect(check(['.'])).toEqual({ ok: true, output: '' });
  }, 60000);
});

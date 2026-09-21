/**
 * @jest-environment node
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeProjectFiles } from '../adapters/NodeProjectFiles.js';

// The local app's services reach the disk only through this (#21), by paths relative to the project. A
// path built from a request must never reach past the project, or into what the server never serves.
describe('the project files, on disk', () => {
  let root;
  let outside;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'project-'));
    outside = mkdtempSync(join(tmpdir(), 'outside-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  test('reads, writes into directories it makes, and says what exists', async () => {
    const files = new NodeProjectFiles(root);

    await files.writeText('applications/acme/advert.txt', 'Senior iOS Engineer\n');

    expect(readFileSync(join(root, 'applications/acme/advert.txt'), 'utf8')).toBe(
      'Senior iOS Engineer\n'
    );
    expect(await files.readText('applications/acme/advert.txt')).toBe('Senior iOS Engineer\n');
    expect(await files.exists('applications/acme/advert.txt')).toBe(true);
    expect(await files.exists('applications/acme/en.json')).toBe(false);
  });

  test('lists a directory, and a directory that does not exist as empty', async () => {
    const files = new NodeProjectFiles(root);
    await files.writeText('applications/acme/advert.txt', 'x');
    await files.writeText('applications/20260921-143205-a1b2c3/state.json', '{}');

    expect((await files.list('applications')).sort()).toEqual(['20260921-143205-a1b2c3', 'acme']);
    expect(await files.list('locales')).toEqual([]);
  });

  test('a path under a file, rather than a directory, does not exist', async () => {
    const files = new NodeProjectFiles(root);
    await files.writeText('applications/notes', 'a stray file');

    expect(await files.exists('applications/notes/state.json')).toBe(false);
  });

  test.each([
    '../outside.txt',
    'applications/../../outside.txt',
    '/etc/hostname',
    '.git/config',
    'applications/.hidden/en.json',
    ''
  ])('refuses "%s", to read, to write and to look for', async (path) => {
    const files = new NodeProjectFiles(root);

    await expect(files.writeText(path, 'x')).rejects.toThrow(/outside|hidden|not a path/);
    await expect(files.readText(path)).rejects.toThrow(/outside|hidden|not a path/);
    await expect(files.exists(path)).rejects.toThrow(/outside|hidden|not a path/);
    await expect(files.list(path)).rejects.toThrow(/outside|hidden|not a path/);
  });

  test('refuses a link inside the project that leads out of it, and makes nothing out there', async () => {
    mkdirSync(join(root, 'applications'));
    symlinkSync(outside, join(root, 'applications', 'acme'));
    const files = new NodeProjectFiles(root);

    await expect(files.writeText('applications/acme/new/advert.txt', 'x')).rejects.toThrow(
      /outside/
    );
    await expect(files.writeText('applications/acme/advert.txt', 'x')).rejects.toThrow(/outside/);
    expect(existsSync(join(outside, 'new'))).toBe(false);
    expect(existsSync(join(outside, 'advert.txt'))).toBe(false);
    await expect(files.list('applications/acme')).rejects.toThrow(/outside/);
  });
});

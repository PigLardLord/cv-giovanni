/**
 * @jest-environment node
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FullCvFiles, fullCvFiles } from '../adapters/FullCvFiles.js';
import { localServices } from '../scripts/serve.mjs';

// A tailoring starts from the full CV its owner keeps outside the repository, and every letter from the defaults kept
// beside it (#260, #279). Both are private: never inside the project, and never readable by another user.
describe('where the full CV and the letter defaults are kept', () => {
  test('beside the key and the token, under $XDG_CONFIG_HOME or ~/.config', () => {
    expect(fullCvFiles({ env: { XDG_CONFIG_HOME: '/xdg' }, home: '/home/ada' })).toEqual({
      cv: '/xdg/mycv/full-cv/en.json',
      letter: '/xdg/mycv/full-cv/letter.json'
    });
    expect(fullCvFiles({ env: {}, home: '/home/ada' })).toEqual({
      cv: '/home/ada/.config/mycv/full-cv/en.json',
      letter: '/home/ada/.config/mycv/full-cv/letter.json'
    });
  });

  test('never inside the project', () => {
    expect(() =>
      fullCvFiles({ env: { XDG_CONFIG_HOME: '/work/cv/config' }, projectRoot: '/work/cv' })
    ).toThrow(/full CV would be inside the project/);
  });

  test('and the server will not start its services with them there, key or no key', () => {
    const root = mkdtempSync(join(tmpdir(), 'project-'));
    try {
      expect(() =>
        localServices(root, {
          env: { XDG_CONFIG_HOME: join(root, 'config') },
          apiKeyFile: '/home/ada/.config/mycv/anthropic-api-key'
        })
      ).toThrow(/full CV would be inside the project/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('reading them', () => {
  let home;
  let files;
  let reader;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'home-'));
    files = fullCvFiles({ env: {}, home });
    mkdirSync(join(home, '.config', 'mycv', 'full-cv'), { recursive: true });
    reader = new FullCvFiles({ ...files, home });
  });

  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const put = (file, text, mode = 0o600) => {
    writeFileSync(file, text);
    chmodSync(file, mode);
  };

  test('a file that is not there is none, and says where it would be', async () => {
    expect(await reader.readCv()).toEqual({ cv: null, where: '~/.config/mycv/full-cv/en.json' });
    expect(await reader.readLetter()).toEqual({
      letter: null,
      where: '~/.config/mycv/full-cv/letter.json'
    });
  });

  test('a private file is read', async () => {
    put(files.cv, '{"name":"Ada Lovelace"}');
    put(files.letter, '{"note":"Remote first."}');

    expect((await reader.readCv()).cv).toEqual({ name: 'Ada Lovelace' });
    expect((await reader.readLetter()).letter).toEqual({ note: 'Remote first.' });
  });

  test.each([
    ['644', 0o644],
    ['640', 0o640],
    ['604', 0o604]
  ])('a file of mode %s, which others can read, is refused', async (_, mode) => {
    put(files.cv, '{"name":"Ada Lovelace"}', mode);

    await expect(reader.readCv()).rejects.toMatchObject({
      status: 503,
      message:
        'The full CV at ~/.config/mycv/full-cv/en.json can be read by other users: set its mode to 600.'
    });
  });

  test('a file that is not JSON is refused, without its content', async () => {
    put(files.letter, 'salary: a secret figure');

    const refusal = await reader.readLetter().catch((error) => error);

    expect(refusal).toMatchObject({
      status: 503,
      message: expect.stringMatching(/not valid JSON/)
    });
    expect(refusal.message).not.toMatch(/secret/);
  });

  test('a directory where the file should be is refused', async () => {
    mkdirSync(files.cv);

    await expect(reader.readCv()).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/not a file/)
    });
  });

  test('a file outside the home directory is shown by its whole path', () => {
    expect(new FullCvFiles({ ...files, home: '/nowhere' }).shown('/xdg/mycv/full-cv/en.json')).toBe(
      '/xdg/mycv/full-cv/en.json'
    );
  });
});

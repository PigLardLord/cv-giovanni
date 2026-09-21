/**
 * @jest-environment node
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiTokenFile, ensureApiToken } from '../adapters/ApiToken.js';

// #260's callers are programs on this machine, which have no browser to trade the preview key for a cookie. They
// get a token instead, kept where the API key is kept: outside the project, readable only by its owner (#270).
describe('where the API token is kept', () => {
  test('beside the API key, under XDG_CONFIG_HOME when it is set and ~/.config when it is not', () => {
    expect(apiTokenFile({ env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/ada' })).toBe(
      '/cfg/mycv/api-token'
    );
    expect(apiTokenFile({ env: {}, home: '/home/ada' })).toBe('/home/ada/.config/mycv/api-token');
    expect(apiTokenFile({ env: { XDG_CONFIG_HOME: 'relative' }, home: '/home/ada' })).toBe(
      '/home/ada/.config/mycv/api-token'
    );
  });

  test('never inside the project, which git tracks and the server serves', () => {
    expect(() =>
      apiTokenFile({ env: { XDG_CONFIG_HOME: '/work/cv/config' }, projectRoot: '/work/cv' })
    ).toThrow(/inside the project/);
  });
});

describe('the API token', () => {
  let config;
  let file;

  beforeEach(() => {
    config = mkdtempSync(join(tmpdir(), 'config-'));
    file = join(config, 'mycv', 'api-token');
  });

  afterEach(() => rmSync(config, { recursive: true, force: true }));

  test('is made on first start: 256 random bits, readable only by its owner', async () => {
    const { token } = await ensureApiToken(file);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readFileSync(file, 'utf8').trim()).toBe(token);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(config, 'mycv')).mode & 0o077).toBe(0);
  });

  test('is the same token on every start after', async () => {
    const first = await ensureApiToken(file);
    const second = await ensureApiToken(file);

    expect(second).toEqual(first);
  });

  test('is two different tokens on two machines', async () => {
    const other = join(config, 'elsewhere', 'mycv', 'api-token');

    expect((await ensureApiToken(file)).token).not.toBe((await ensureApiToken(other)).token);
  });

  // A token other users can read is one they can use. It is not overwritten either: the file is its owner's, and
  // a server that silently replaced it would break every client that already read it.
  test.each([
    ['readable by other users', 0o644, 'a-token-someone-else-could-read', /other users/],
    ['empty', 0o600, '', /empty/]
  ])(
    'is not used when its file is %s, and the server says why',
    async (what, mode, content, reason) => {
      mkdirSync(join(config, 'mycv'), { recursive: true });
      writeFileSync(file, content);
      chmodSync(file, mode);

      const answer = await ensureApiToken(file);

      expect(answer).toEqual({ token: null, reason: expect.stringMatching(reason) });
      expect(readFileSync(file, 'utf8')).toBe(content);
      if (content) expect(answer.reason).not.toContain(content);
    }
  );

  // The server starts without a token when it cannot have one, and says why: a token file it cannot make or read is
  // a reason, never a crash that takes the page and the editor down with it (the review of #271).
  test.each([
    [
      'a directory where the file should be',
      () => mkdirSync(file, { recursive: true, mode: 0o700 }),
      /cannot be read/
    ],
    [
      'a configuration directory it cannot write',
      () => {
        mkdirSync(join(config, 'mycv'), { recursive: true });
        chmodSync(join(config, 'mycv'), 0o500);
      },
      /cannot be made/
    ]
  ])('is none, with a reason, given %s', async (what, arrange, reason) => {
    arrange();
    try {
      expect(await ensureApiToken(file)).toEqual({
        token: null,
        reason: expect.stringMatching(reason)
      });
    } finally {
      chmodSync(join(config, 'mycv'), 0o700);
    }
  });

  // A link to nothing at the token's path: stat says the file is absent, the exclusive write says something is there,
  // and the server used to retry that as a race for ever (#291). A link to nothing as its directory already failed at
  // once, with a reason that did not say why. Both say "a link to nothing" now, and nothing is made through either.
  test.each([
    [
      'the file',
      () => {
        mkdirSync(join(config, 'mycv'));
        symlinkSync(join(config, 'nowhere', 'token'), file);
      }
    ],
    ['its directory', () => symlinkSync(join(config, 'nowhere'), join(config, 'mycv'))]
  ])('is none, with a reason, when %s is a link to nothing', async (_, arrange) => {
    arrange();

    let timer;
    const answer = await Promise.race([
      ensureApiToken(file),
      new Promise((resolve) => (timer = setTimeout(() => resolve('still running'), 2000)))
    ]).finally(() => clearTimeout(timer));

    expect(answer).toEqual({ token: null, reason: expect.stringMatching(/link/) });
    expect(existsSync(join(config, 'nowhere'))).toBe(false);
  });

  // Two servers on the very first start both try to make the file; the one that loses reads what the other made,
  // so both hold the same token rather than one of them crashing.
  test('is one token for two servers starting at once', async () => {
    const [first, second] = await Promise.all([ensureApiToken(file), ensureApiToken(file)]);

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toEqual(first);
  });
});

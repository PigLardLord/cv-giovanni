/**
 * @jest-environment node
 *
 * The server half of this file drives a real socket, so it needs Node's `fetch` and not
 * jsdom's absent one. Nothing here touches the DOM.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { LocalProfiles } from '../core/LocalProfiles.js';
import { createStaticServer, previewKey } from '../scripts/serve.mjs';

const published = {
  defaultProfile: 'general',
  profiles: { general: { locales: { en: 'profiles/general/en.json' } } }
};

describe('LocalProfiles.merge', () => {
  test('adds a local profile without touching the published one', () => {
    const { manifest, added } = LocalProfiles.merge(published, [
      { profile: 'act-ai', locale: 'en', path: 'applications/act-ai/en.json' }
    ]);

    expect(manifest.profiles.general.locales.en).toBe('profiles/general/en.json');
    expect(manifest.profiles['act-ai'].locales.en).toBe('applications/act-ai/en.json');
    expect(added).toEqual(['act-ai']);
  });

  test('leaves the argument alone', () => {
    LocalProfiles.merge(published, [
      { profile: 'x', locale: 'en', path: 'applications/x/en.json' }
    ]);

    expect(Object.keys(published.profiles)).toEqual(['general']);
  });

  // An untracked directory that overrode the public CV would put the page and the
  // repository into disagreement with nothing on screen to show it.
  test('a local profile never shadows a published one', () => {
    const { manifest, shadowed } = LocalProfiles.merge(published, [
      { profile: 'general', locale: 'en', path: 'applications/general/en.json' }
    ]);

    expect(manifest.profiles.general.locales.en).toBe('profiles/general/en.json');
    expect(shadowed).toEqual(['general']);
  });

  test('only <locale>.json counts as a profile', () => {
    const entries = LocalProfiles.entriesFrom([
      { profile: 'act-ai', files: ['en.json', 'de.json', 'advert.txt', 'notes.json', 'out'] }
    ]);

    expect(entries.map((entry) => entry.locale)).toEqual(['en', 'de']);
  });
});

describe('the development server merges without writing', () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mycv-serve-'));
    await mkdir(join(root, 'config'), { recursive: true });
    await mkdir(join(root, 'applications', 'act-ai', 'out'), { recursive: true });
    await writeFile(
      join(root, 'config', 'cv-manifest.json'),
      `${JSON.stringify(published, null, 2)}\n`
    );
    await writeFile(join(root, 'applications', 'act-ai', 'en.json'), '{}');
    await writeFile(join(root, 'applications', 'act-ai', 'advert.txt'), 'an advert');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A request as this machine's browser sends it, once it has opened the address with the key (#71). */
  async function get(path) {
    const key = previewKey();
    const server = createStaticServer(root, { key });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const send = (target, headers = {}) =>
      new Promise((resolve, reject) => {
        const { port } = server.address();
        httpRequest({ host: '127.0.0.1', port, path: target, headers }, (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (body += chunk));
          response.on('end', () =>
            resolve({ status: response.statusCode, headers: response.headers, body })
          );
        })
          .on('error', reject)
          .end();
      });
    try {
      const traded = await send(`/index.html?key=${key}`);
      const cookie = traded.headers['set-cookie'][0].split(';')[0];
      const { status, body } = await send(path, { cookie });
      return { status, body };
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  }

  test('the served manifest carries the local profile', async () => {
    const { status, body } = await get('/config/cv-manifest.json');

    expect(status).toBe(200);
    expect(JSON.parse(body).profiles['act-ai'].locales.en).toBe('applications/act-ai/en.json');
  });

  // The whole reason the merge happens in memory. A manifest that gained an entry on disk
  // would be committed by the next person who ran `git add -A`.
  test('the file on disk is untouched', async () => {
    const before = await readFile(join(root, 'config', 'cv-manifest.json'), 'utf8');

    await get('/config/cv-manifest.json');

    expect(await readFile(join(root, 'config', 'cv-manifest.json'), 'utf8')).toBe(before);
    expect(JSON.parse(before).profiles['act-ai']).toBeUndefined();
  });

  test('the local profile data is reachable, so the page can render it', async () => {
    expect((await get('/applications/act-ai/en.json')).status).toBe(200);
  });
});

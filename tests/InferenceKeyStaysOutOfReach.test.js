/**
 * @jest-environment node
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { createStaticServer, localServices, previewKey } from '../scripts/serve.mjs';

// #22: the API key is kept outside the repository, in a file only its owner can read, and nothing the
// development server serves can reach it: not a path, not a link inside the tree, not an answer from its API.
describe('the API key, and the server that must not hand it out', () => {
  const KEY = previewKey();
  const SECRET = 'sk-ant-test-never-served-0123456789abcdef';
  let root;
  let config;
  let keyPath;
  let server;

  const start = async (options) => {
    server = createStaticServer(root, { key: KEY, ...options });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  };
  const send = (path, headers = {}) =>
    new Promise((resolve, reject) => {
      const { port } = server.address();
      httpRequest(
        { host: '127.0.0.1', port, path, headers: { host: `localhost:${port}`, ...headers } },
        (response) => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () => resolve({ status: response.statusCode, body: text }));
        }
      )
        .on('error', reject)
        .end();
    });
  const cookieFor = async () => {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
      httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: `/index.html?key=${KEY}`,
          headers: { host: `localhost:${port}` }
        },
        (response) => {
          response.resume();
          resolve((response.headers['set-cookie'] || [''])[0].split(';')[0]);
        }
      )
        .on('error', reject)
        .end();
    });
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'served-'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>CV</title>');
    config = mkdtempSync(join(tmpdir(), 'config-'));
    mkdirSync(join(config, 'mycv'));
    keyPath = join(config, 'mycv', 'anthropic-api-key');
    writeFileSync(keyPath, `${SECRET}\n`);
    chmodSync(keyPath, 0o600);
  });

  afterEach(async () => {
    server?.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
    rmSync(root, { recursive: true, force: true });
    rmSync(config, { recursive: true, force: true });
  });

  test('the API says which backend a run would use and how it is charged, and never shows the key', async () => {
    await start({
      services: localServices(root, { claude: join(root, 'no-claude-here'), apiKeyFile: keyPath })
    });

    const response = await send('/api/inference', { cookie: await cookieFor() });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      backend: 'anthropic-api',
      cost: { charged: 'per run, to the API key' },
      unavailable: [{ backend: 'claude-cli' }]
    });
    expect(response.body).not.toContain(SECRET);
  });

  test('a link inside the tree to the key’s directory reaches nothing, even from this machine with the key', async () => {
    symlinkSync(config, join(root, 'settings'));
    await start();
    const cookie = await cookieFor();

    for (const headers of [{ cookie }, {}]) {
      const response = await send('/settings/mycv/anthropic-api-key', headers);
      expect(response.status).toBe(404);
      expect(response.body).not.toContain(SECRET);
    }
  });

  // The server builds its services from the environment on the first request to the API, so this sets the
  // environment the way a user would, and puts it back.
  test('a place for the key inside the project is refused, and the API says nothing about it', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(root, 'cfg');
    try {
      expect(() => localServices(root)).toThrow(/inside the project/);
      await start();

      const response = await send('/api/inference', { cookie: await cookieFor() });

      expect(response.status).toBe(500);
      expect(response.body).not.toContain(root);
    } finally {
      if (before === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = before;
      quiet.mockRestore();
    }
  });
});

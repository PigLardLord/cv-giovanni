/**
 * @jest-environment node
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer, previewKey } from '../scripts/serve.mjs';
import { NodeProjectFiles } from '../adapters/NodeProjectFiles.js';
import { Tailorings } from '../core/Tailorings.js';

// The local API writes the CV and runs scripts, so it answers exactly whom applications/ answers: this
// machine's browser holding the run's key (#21, #71). And only from the page this server serves: a
// request that says it comes from another origin or another site finds nothing there, key or not.
describe('who the local API answers', () => {
  const KEY = previewKey();
  const PROFILE = '{\n  "name": "Giovanni Trovato"\n}\n';
  let root;
  let server;

  const start = async (options) => {
    server = createStaticServer(root, options);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  };
  const send = (method, path, headers = {}, body) =>
    new Promise((resolve, reject) => {
      const { port } = server.address();
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: { host: `localhost:${port}`, ...headers }
        },
        (response) => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () =>
            resolve({ status: response.statusCode, headers: response.headers, body: text })
          );
        }
      );
      request.on('error', reject);
      request.end(body);
    });
  const cookieFor = async () => {
    const { headers } = await send('GET', `/index.html?key=${KEY}`);
    return (headers['set-cookie'] || [''])[0].split(';')[0];
  };
  const onDisk = () => readFileSync(join(root, 'profiles', 'general', 'en.json'), 'utf8');

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'api-'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>CV</title>');
    mkdirSync(join(root, 'profiles', 'general'), { recursive: true });
    writeFileSync(join(root, 'profiles', 'general', 'en.json'), PROFILE);
    mkdirSync(join(root, 'config'));
    writeFileSync(
      join(root, 'config', 'cv-manifest.json'),
      JSON.stringify({
        defaultProfile: 'general',
        profiles: { general: { locales: { en: 'profiles/general/en.json' } } }
      })
    );
  });

  afterEach(async () => {
    server?.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
    rmSync(root, { recursive: true, force: true });
  });

  test('this machine’s browser holding the key reads the profile, never cached', async () => {
    await start({ key: KEY });

    const response = await send('GET', '/api/profile', { cookie: await cookieFor() });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ name: 'Giovanni Trovato' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test('and creates an application under applications/, from its own page', async () => {
    await start({ key: KEY });
    const self = `http://localhost:${server.address().port}`;

    const response = await send(
      'POST',
      '/api/applications',
      {
        cookie: await cookieFor(),
        'content-type': 'application/json',
        origin: self,
        'sec-fetch-site': 'same-origin'
      },
      JSON.stringify({ name: 'acme', advert: 'Senior iOS Engineer\n' })
    );

    expect(response.status).toBe(200);
    expect(readFileSync(join(root, 'applications', 'acme', 'advert.txt'), 'utf8')).toBe(
      'Senior iOS Engineer\n'
    );
    expect(readFileSync(join(root, 'applications', 'acme', 'en.json'), 'utf8')).toBe(PROFILE);
  });

  test('without the key the API is not there, and nothing is written', async () => {
    await start({ key: KEY });

    expect((await send('GET', '/api/profile')).status).toBe(404);
    const put = await send(
      'PUT',
      '/api/profile',
      { 'content-type': 'application/json' },
      '{"name":"x"}'
    );
    expect(put.status).toBe(404);
    expect(onDisk()).toBe(PROFILE);
  });

  test('another machine gets nothing, whatever cookie it holds', async () => {
    await start({ key: KEY, isLocal: () => false });

    expect((await send('GET', '/api/profile', { cookie: await cookieFor() })).status).toBe(404);
  });

  test.each([
    ['another origin', { origin: 'https://rebound.example' }],
    ['this machine under another port', { origin: 'http://localhost:1' }],
    ['a fetch the browser marks as cross-site', { 'sec-fetch-site': 'cross-site' }],
    ['a fetch the browser marks as same-site, from another port', { 'sec-fetch-site': 'same-site' }]
  ])('a request from %s is refused, key and all, and writes nothing', async (what, headers) => {
    await start({ key: KEY });

    const response = await send(
      'PUT',
      '/api/profile',
      { cookie: await cookieFor(), 'content-type': 'application/json', ...headers },
      '{"name":"Someone Else"}'
    );

    expect(response.status).toBe(404);
    expect(onDisk()).toBe(PROFILE);
  });

  test('the static half beside it still sends no-store', async () => {
    await start({ key: KEY });

    const response = await send('GET', '/index.html');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store, must-revalidate');
  });

  // #260's callers are programs on this machine, with no browser to trade the key for a cookie: they send the
  // token kept in ~/.config/mycv/api-token instead (#270). It replaces the cookie and nothing else — the request
  // still comes directly from this machine and from no other origin.
  describe('with the API token instead of the cookie', () => {
    const TOKEN = previewKey();
    const bearer = (token = TOKEN) => ({ authorization: `Bearer ${token}` });

    test('a program on this machine reaches the API', async () => {
      await start({ key: KEY, apiToken: TOKEN });

      const answer = await send('GET', '/api/profile', bearer());

      expect(answer.status).toBe(200);
      expect(JSON.parse(answer.body)).toMatchObject({ name: 'Giovanni Trovato' });
    });

    test.each([
      ['a wrong token', () => bearer('not-the-token')],
      ['the preview key in its place', () => bearer(KEY)],
      ['no token at all', () => ({})],
      ['the token through a proxy', () => ({ ...bearer(), 'x-forwarded-for': '203.0.113.9' })],
      ['the token from another origin', () => ({ ...bearer(), origin: 'https://example.com' })],
      ['the token from another site', () => ({ ...bearer(), 'sec-fetch-site': 'cross-site' })],
      ['the token as a cookie', () => ({ cookie: `mycv-api=${TOKEN}` })],
      ['a scheme other than Bearer', () => ({ authorization: `Basic ${TOKEN}` })]
    ])('%s finds nothing there', async (what, headers) => {
      await start({ key: KEY, apiToken: TOKEN });

      expect((await send('GET', '/api/profile', headers())).status).toBe(404);
    });

    test('a server with no usable token lets no bearer in, and the cookie still works', async () => {
      await start({ key: KEY, apiToken: null });

      expect((await send('GET', '/api/profile', bearer())).status).toBe(404);
      expect((await send('GET', '/api/profile', { cookie: await cookieFor() })).status).toBe(200);
    });

    // What keeps a page on another site from sending the header is the CORS preflight, and that holds only while the
    // server grants none. A "helpful" CORS header added later would pass every other test here (the review of #271).
    test('a preflight from another site finds nothing, and no response grants CORS', async () => {
      await start({ key: KEY, apiToken: TOKEN });

      const preflight = await send('OPTIONS', '/api/profile', {
        origin: 'http://evil.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization'
      });
      const answered = await send('GET', '/api/profile', bearer());

      expect(preflight.status).toBe(404);
      for (const { headers } of [preflight, answered]) {
        expect(Object.keys(headers).filter((name) => name.startsWith('access-control'))).toEqual(
          []
        );
      }
    });

    // RFC 9110 makes an authentication scheme case-insensitive: a client that writes "bearer" is sending the token.
    test('the scheme is read whatever its case', async () => {
      await start({ key: KEY, apiToken: TOKEN });

      expect((await send('GET', '/api/profile', { authorization: `bearer ${TOKEN}` })).status).toBe(
        200
      );
    });

    // The token opens the API, not applications/ served as files: those stay the cookie's.
    test('opens the API and nothing the cookie alone opens', async () => {
      mkdirSync(join(root, 'applications', 'acme'), { recursive: true });
      writeFileSync(join(root, 'applications', 'acme', 'en.json'), '{}');
      await start({ key: KEY, apiToken: TOKEN });

      expect((await send('GET', '/applications/acme/en.json', bearer())).status).toBe(404);
    });
  });

  // #260's whole point: a program posts an advert, gets an id and an estimate at once, and polls (#275).
  describe('a tailoring, from a program on this machine', () => {
    const TOKEN = previewKey();
    const json = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
    const withTailorings = () => {
      mkdirSync(join(root, 'locales', 'en'), { recursive: true });
      writeFileSync(
        join(root, 'config', 'cv-manifest.json'),
        JSON.stringify({ defaultProfile: 'general', profiles: {}, layouts: ['technical'] })
      );
      const files = new NodeProjectFiles(root);
      const inference = {
        status: async () => ({ backend: 'claude-cli', cost: { perRun: 0 }, unavailable: [] })
      };
      return {
        tailorings: new Tailorings({ files, inference, work: async () => ({ done: true }) })
      };
    };

    test('is accepted at once with 202, runs, and is polled to ready', async () => {
      const services = withTailorings();
      await start({ key: KEY, apiToken: TOKEN, services });

      const posted = await send(
        'POST',
        '/api/tailorings',
        json,
        JSON.stringify({ advert: 'Senior iOS Engineer' })
      );
      expect(posted.status).toBe(202);
      const { id, status, backend, estimateSeconds } = JSON.parse(posted.body);
      expect({ status, backend }).toEqual({ status: 'queued', backend: 'claude-cli' });
      expect(estimateSeconds).toBeGreaterThan(0);

      await services.tailorings.idle();
      const polled = await send('GET', `/api/tailorings/${id}`, json);
      expect(polled.status).toBe(200);
      expect(JSON.parse(polled.body)).toMatchObject({
        id,
        status: 'ready',
        result: { done: true }
      });
      expect(readFileSync(join(root, 'applications', id, 'advert.txt'), 'utf8')).toBe(
        'Senior iOS Engineer'
      );
    });

    test('finds nothing there without the token, and an unknown job is a 404', async () => {
      await start({ key: KEY, apiToken: TOKEN, services: withTailorings() });

      const body = JSON.stringify({ advert: 'Senior iOS Engineer' });
      expect(
        (await send('POST', '/api/tailorings', { 'content-type': 'application/json' }, body)).status
      ).toBe(404);
      expect((await send('GET', '/api/tailorings/20260921-143205-ffffff', json)).status).toBe(404);
    });
  });
});

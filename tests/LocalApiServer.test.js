/**
 * @jest-environment node
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer, previewKey } from '../scripts/serve.mjs';

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
});

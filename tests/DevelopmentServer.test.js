/**
 * @jest-environment node
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  createStaticServer,
  isFromThisMachine,
  isLoopback,
  listenSettings,
  mayServe,
  previewKey
} from '../scripts/serve.mjs';

// The development server once listened on every interface and served every file under the root:
// anyone on the same network — or on a Tailscale network this machine belongs to — could read
// .git/ and, once an application existed, the tailored CVs and the employers they name (#65).
// AGENTS.md: a tailored version leaves the machine only as an attached PDF.

describe('who counts as this machine', () => {
  test.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('%s is loopback', (address) => {
    expect(isLoopback(address)).toBe(true);
  });

  test.each(['192.168.1.20', '10.0.0.7', '100.101.102.103', '::ffff:192.168.1.20', '', undefined])(
    '%s is another machine',
    (address) => {
      expect(isLoopback(address)).toBe(false);
    }
  );
});

describe('a request from this machine', () => {
  const arriving = (headers, remoteAddress = '127.0.0.1') => ({
    socket: { remoteAddress },
    headers
  });

  test.each(['localhost:8080', '127.0.0.1:8123', '[::1]:8080', 'cv.localhost:8080', 'LOCALHOST'])(
    'arrives on loopback addressed to %s',
    (host) => {
      expect(isFromThisMachine(arriving({ host }))).toBe(true);
    }
  );

  // A page on another site can point its own name at 127.0.0.1; the name it used is still in Host.
  test.each(['rebound.example:8080', '192.168.1.20:8080', ''])(
    'addressed to "%s", is not',
    (host) => {
      expect(isFromThisMachine(arriving({ host }))).toBe(false);
    }
  );

  test.each(['forwarded', 'via', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip'])(
    'carrying %s, came through a proxy and is not',
    (header) => {
      expect(isFromThisMachine(arriving({ host: 'localhost:8080', [header]: '203.0.113.9' }))).toBe(
        false
      );
    }
  );

  test('from a LAN address, is not', () => {
    expect(isFromThisMachine(arriving({ host: 'localhost:8080' }, '192.168.1.20'))).toBe(false);
  });
});

describe('which paths may be served', () => {
  const path = (value) => value.split('/').join(sep);

  test.each(['index.html', 'vendor/fonts/fonts.css', 'config/cv-manifest.json'])(
    '%s, to anyone',
    (value) => {
      expect([mayServe(path(value), false), mayServe(path(value), true)]).toEqual([true, true]);
    }
  );

  test.each(['.git/config', 'profiles/.DS_Store', '../outside.txt'])('%s, to nobody', (value) => {
    expect([mayServe(path(value), false), mayServe(path(value), true)]).toEqual([false, false]);
  });

  // A case-insensitive filesystem opens Applications/ as applications/, and Windows drops a trailing
  // dot or space: every spelling that reaches the directory is the directory.
  test.each([
    'applications/acme/en.json',
    'Applications/acme/en.json',
    'APPLICATIONS/acme/en.json',
    'applications./acme/en.json',
    'applications /acme/en.json'
  ])('%s, to this machine only', (value) => {
    expect([mayServe(path(value), false), mayServe(path(value), true)]).toEqual([false, true]);
  });

  test('a path that is not inside the root at all, to nobody', () => {
    expect(mayServe(join(sep, 'etc', 'passwd'), true)).toBe(false);
  });
});

describe('where the server listens', () => {
  test('on the loopback interface, unless told otherwise', () => {
    expect(listenSettings([], {})).toEqual({ port: 8080, host: '127.0.0.1', network: false });
  });

  test('the port still comes from the argument or PORT', () => {
    expect(listenSettings(['8123'], {}).port).toBe(8123);
    expect(listenSettings([], { PORT: '9000' }).port).toBe(9000);
  });

  // Opening the server to the network is a decision, so it takes a word of its own.
  test('on every interface only with --network', () => {
    expect(listenSettings(['8123', '--network'], {})).toEqual({
      port: 8123,
      host: '0.0.0.0',
      network: true
    });
  });
});

// A relay that forwards raw bytes — `ssh -R`, `socat`, a tunnel in TCP mode — connects from loopback and
// adds no header, so a visitor at its far end who writes `Host: localhost` looks exactly like this
// machine's browser. Nothing in the request can tell them apart; only something the visitor never had
// can: a key made when the server starts, printed once, and traded by the browser for a cookie (#71).
describe('the key a run hands out', () => {
  test('is new every time, and too long to guess', () => {
    const keys = new Set(Array.from({ length: 20 }, () => previewKey()));

    expect(keys.size).toBe(20);
    for (const key of keys) expect(Buffer.from(key, 'base64url').length).toBeGreaterThanOrEqual(32);
  });
});

describe('what the server hands out', () => {
  const KEY = previewKey();
  let root;
  let server;
  let origin;

  const start = async (options) => {
    server = createStaticServer(root, options);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const get = async (path) => {
    const response = await fetch(`${origin}${path}`);
    return { status: response.status, body: await response.text() };
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'serve-'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>CV</title>');
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'config'), '[remote "origin"]\n');
    mkdirSync(join(root, 'config'));
    writeFileSync(
      join(root, 'config', 'cv-manifest.json'),
      JSON.stringify({
        defaultProfile: 'general',
        profiles: { general: { locales: { en: 'profiles/general/en.json' } } }
      })
    );
    mkdirSync(join(root, 'applications', 'acme'), { recursive: true });
    writeFileSync(join(root, 'applications', 'acme', 'en.json'), '{"name":"tailored for Acme"}');
  });

  afterEach(async () => {
    // fetch keeps its connection alive; close it with the server rather than wait out the timeout.
    server?.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
    rmSync(root, { recursive: true, force: true });
  });

  test('the page itself is served', async () => {
    await start();
    expect((await get('/')).status).toBe(200);
  });

  test('.git is never served, not even to this machine', async () => {
    await start();
    expect((await get('/.git/config')).status).toBe(404);
    expect((await get('/.git/')).status).toBe(404);
    expect((await get('/%2egit/config')).status).toBe(404);
  });

  // A raw request, so the test sends what a browser would not: a malformed path, another Host, the
  // headers a proxy adds, a cookie of its own making.
  const send = (path, headers = {}) =>
    new Promise((resolve, reject) => {
      const { port } = server.address();
      httpRequest({ host: '127.0.0.1', port, path, headers }, (response) => {
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
  const getAs = async (path, headers) => (await send(path, headers)).status;

  /** What a browser holds once it has opened the address the server printed. */
  const cookieFor = async (key) => {
    const { headers } = await send(`/index.html?key=${key}`);
    return (headers['set-cookie'] || [''])[0].split(';')[0];
  };

  test('this machine previews a tailored CV once its browser holds the run’s key', async () => {
    await start({ key: KEY });
    const cookie = await cookieFor(KEY);
    expect((await send('/applications/acme/en.json', { cookie })).status).toBe(200);
    expect((await send('/config/cv-manifest.json', { cookie })).body).toContain('acme');
  });

  test('the key in the address is traded for a cookie, and the address drops it', async () => {
    await start({ key: KEY });
    const { port } = server.address();
    const { status, headers } = await send(`/index.html?layout=nerd&key=${KEY}&lang=en`);

    expect(status).toBe(303);
    expect(headers.location).toBe('/index.html?layout=nerd&lang=en');
    expect(headers['set-cookie']).toHaveLength(1);
    const [pair, ...attributes] = headers['set-cookie'][0].split('; ');
    expect(pair).toBe(`mycv-preview-${port}=${KEY}`);
    expect(attributes).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Strict', 'Path=/']));
  });

  // The acceptance case of #71, sent the way the relay would: from loopback, addressed to localhost,
  // with no forwarding header — so the server's own check of this machine passes it.
  test('a relay that sends Host: localhost and no header gets nothing private without the key', async () => {
    await start({ key: KEY });
    const relayed = { host: `localhost:${server.address().port}` };

    expect(await getAs('/applications/acme/en.json', relayed)).toBe(404);
    const manifest = await send('/config/cv-manifest.json', relayed);
    expect(manifest.status).toBe(200);
    expect(manifest.body).not.toContain('acme');
  });

  test('a wrong key buys no cookie, and a cookie made up opens nothing', async () => {
    await start({ key: KEY });
    const { port } = server.address();
    const wrong = previewKey();

    const traded = await send(`/index.html?key=${wrong}`);
    expect(traded.status).toBe(303);
    expect(traded.headers['set-cookie']).toBeUndefined();
    for (const cookie of [
      `mycv-preview-${port}=${wrong}`,
      `mycv-preview-${port}=`,
      `mycv-preview-1=${KEY}`
    ]) {
      expect(await getAs('/applications/acme/en.json', { cookie })).toBe(404);
    }
  });

  test('a server given no key makes its own, so nothing private is served by default', async () => {
    await start();
    expect(await getAs('/applications/acme/en.json')).toBe(404);
    expect((await send('/config/cv-manifest.json')).body).not.toContain('acme');
  });

  // A request from another machine cannot be made from a test, so the check that decides it is
  // handed in: the same server, answering as it would to an address that is not loopback.
  test('another machine gets neither the applications nor the manifest that lists them, key or not', async () => {
    await start({ isLocal: () => false, key: KEY });
    const cookie = await cookieFor(KEY);
    expect(await getAs('/applications/acme/en.json', { cookie })).toBe(404);
    const manifest = await send('/config/cv-manifest.json', { cookie });
    expect(manifest.status).toBe(200);
    expect(manifest.body).not.toContain('acme');
  });

  test('a malformed address is refused, and the next request is still served', async () => {
    await start();
    expect(await getAs('/%ZZ')).toBe(400);
    expect(await getAs('//')).toBe(400);
    expect((await get('/')).status).toBe(200);
  });

  // A link inside the tree can point anywhere: what counts is where the file really is, not the name
  // the request used to reach it.
  test('a symbolic link reaches neither .git, nor applications from another machine, nor out of the tree', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'outside-'));
    writeFileSync(join(outside, 'secret.txt'), 'not the site');
    symlinkSync(join(root, '.git'), join(root, 'history'));
    symlinkSync(join(root, 'applications', 'acme'), join(root, 'latest'));
    symlinkSync(outside, join(root, 'elsewhere'));
    try {
      await start({ isLocal: () => false });
      expect((await get('/history/config')).status).toBe(404);
      expect((await get('/latest/en.json')).status).toBe(404);
      expect((await get('/elsewhere/secret.txt')).status).toBe(404);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('a directory whose index.html links into .git is not served', async () => {
    mkdirSync(join(root, 'docs'));
    symlinkSync(join(root, '.git', 'config'), join(root, 'docs', 'index.html'));
    await start();
    expect((await get('/docs/')).status).toBe(404);
  });

  // The manifest is merged from disk for this machine only, and the file it merges from is held to
  // the same rules as any other.
  test('the manifest is not merged from a link that leads to a hidden file', async () => {
    writeFileSync(join(root, '.private.json'), JSON.stringify({ secret: 'private', profiles: {} }));
    rmSync(join(root, 'config', 'cv-manifest.json'));
    symlinkSync(join(root, '.private.json'), join(root, 'config', 'cv-manifest.json'));
    await start({ key: KEY });
    const manifest = await send('/config/cv-manifest.json', { cookie: await cookieFor(KEY) });
    expect(manifest.body).not.toContain('private');
    expect(manifest.status).toBe(404);
  });

  // A tunnel or reverse proxy on this machine connects from loopback for a visitor elsewhere, and says
  // so in a header; a page on another site that points its own name at 127.0.0.1 still sends that
  // name as Host.
  test('a request through a proxy, or under another site’s name, is not from this machine', async () => {
    await start({ key: KEY });
    const { port } = server.address();
    const cookie = await cookieFor(KEY);
    const tailored = '/applications/acme/en.json';
    expect(await getAs(tailored, { host: `127.0.0.1:${port}`, cookie })).toBe(200);
    expect(
      await getAs(tailored, { host: `127.0.0.1:${port}`, cookie, 'x-forwarded-for': '203.0.113.9' })
    ).toBe(404);
    expect(await getAs(tailored, { host: `rebound.example:${port}`, cookie })).toBe(404);
  });
});

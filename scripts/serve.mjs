import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, realpath, realpathSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { LocalProfiles } from '../core/LocalProfiles.js';
import { extname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

/**
 * A development server that refuses to let the browser cache anything.
 *
 * `python -m http.server` sends no Cache-Control at all, so a browser falls
 * back to heuristic freshness and may hold a module for days. This project has
 * lost time to that three times: a stylesheet edit that appeared not to work, a
 * "verification" that was really reading the previous build, and a renderer
 * change that was invisible on screen while it was plainly present in the
 * printed PDF. Everything here is served `no-store`, so what you see is what is
 * on disk.
 *
 * GitHub Pages, where this site is published, sends `max-age=600` with an
 * ETag — a returning visitor can be up to ten minutes behind a deploy and no
 * longer. That is a property of the host, not something this file changes.
 */
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * True for an address on this machine: IPv4 loopback, IPv6 loopback, and IPv4 loopback as a dual-stack
 * socket reports it. Everything else — a LAN address, a Tailscale address, a missing one — is another
 * machine.
 * @param {string|undefined} address - `request.socket.remoteAddress`
 * @returns {boolean} Whether the request came from this machine
 */
export function isLoopback(address) {
  if (!address) return false;
  const plain = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return plain === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(plain);
}

/**
 * Headers a proxy or tunnel adds for the visitor it forwards. Only their presence counts: the address
 * they carry is whatever the client wrote, so it can take access away but never grant it.
 */
const FORWARDING_HEADERS = ['forwarded', 'via', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip'];

/**
 * True for a request this machine's own browser sent directly. Arriving on loopback is not enough: a
 * tunnel or reverse proxy running here connects from loopback for a visitor elsewhere, and says so in a
 * header; a page on another site can point its own name at 127.0.0.1 and read what it fetches, and the
 * name it used is still in Host. So the request must also be addressed to this machine. A relay that
 * forwards raw bytes adds no header and cannot be told apart, which is why a private response also needs
 * the key the server printed when it started (`previewKey`).
 * @param {import('node:http').IncomingMessage} request - The request
 * @returns {boolean} Whether this machine's browser sent it, with nothing in between
 */
export function isFromThisMachine({ socket, headers = {} }) {
  const name = (headers.host || '')
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^\[(.*)\]$/, '$1');
  const addressedHere = name === 'localhost' || name.endsWith('.localhost') || isLoopback(name);
  return (
    isLoopback(socket?.remoteAddress) &&
    addressedHere &&
    !FORWARDING_HEADERS.some((header) => header in headers)
  );
}

/**
 * A key for one run of the server: 256 random bits, made at start, printed once, held in memory and
 * written nowhere. A relay that forwards raw bytes — `ssh -R`, `socat`, a tunnel in TCP mode — carries a
 * visitor's request in from loopback with no header to give it away, and nothing in that request can
 * prove where it came from (#71). Something the visitor never had can: this key, which the browser on
 * this machine trades for a cookie.
 * @returns {string} The key, base64url
 */
export function previewKey() {
  return randomBytes(32).toString('base64url');
}

/** The cookie that carries the key, named for the port so two servers here keep their own. */
const keyCookie = (port) => `mycv-preview-${port}`;

/**
 * Whether a value is the key, compared in constant time. Both sides are hashed first, so the
 * comparison always runs over two 32-byte digests: neither the key's length nor the first byte that
 * differs shows in how long it takes.
 */
function isKey(offered, key) {
  if (typeof offered !== 'string') return false;
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(offered), digest(key));
}

/** The value of one cookie in a Cookie header, or undefined when it is not there. */
function cookieValue(header, name) {
  for (const pair of (header || '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

/**
 * Where to listen. Loopback by default: this server hands out a tracked repository and, once one
 * exists, CVs tailored to named employers, which AGENTS.md says leave the machine only as an attached
 * PDF. Serving other devices on the network — a phone, say — takes `--network`, said out loud.
 * @param {string[]} args - The command-line arguments after the script
 * @param {object} env - The environment
 * @returns {{ port: number, host: string, network: boolean }} The listening settings
 */
export function listenSettings(args = [], env = {}) {
  const network = args.includes('--network');
  const port = Number(args.find((arg) => /^\d+$/.test(arg)) || env.PORT || 8080);
  return { port, host: network ? '0.0.0.0' : '127.0.0.1', network };
}

const types = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  })
);

/** Resolve a request path inside the project, or null when it escapes it. */
function resolve(url, root) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const target = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  return target === root.replace(/[\\/]$/, '') || target.startsWith(root) ? target : null;
}

const realpathOf = promisify(realpath.native);

/**
 * Whether a path relative to the root may be served; `trusted` for a request this machine's browser sent
 * directly, holding the run's key. A hidden segment — `.git/`, `.claude/`, `..` — never; `applications/`
 * only to a trusted request, compared the way a filesystem may open it: case-insensitively, and without
 * the trailing dots and spaces Windows drops.
 * @param {string} path - A path relative to the root, as `path.relative` returns it
 * @param {boolean} trusted - Whether the request came from this machine's browser with the key
 * @returns {boolean} Whether the file may be sent
 */
export function mayServe(path, trusted) {
  const segments = path.split(sep);
  if (isAbsolute(path) || segments.some((segment) => segment.startsWith('.'))) return false;
  return trusted || segments[0].toLowerCase().replace(/[. ]+$/, '') !== 'applications';
}

/**
 * The manifest as it should be served here: the committed one, plus whatever profiles
 * exist under `applications/`.
 *
 * The merge happens in memory and the file on disk is never touched. `config/cv-manifest.json`
 * is tracked, so an entry written into it would be committed by the next `git add -A` — and
 * that entry names the company the CV was tailored for. What is not written cannot leak.
 * @param {string} root - Directory being served
 * @returns {Promise<string|null>} The manifest to send, or null to fall through
 */
async function localManifest(root) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, 'config', 'cv-manifest.json'), 'utf8'));
  } catch {
    return null;
  }

  let directories = [];
  try {
    const entries = await readdir(join(root, 'applications'), { withFileTypes: true });
    directories = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => ({
          profile: entry.name,
          files: await readdir(join(root, 'applications', entry.name))
        }))
    );
  } catch {
    return `${JSON.stringify(manifest, null, 2)}\n`;
  }

  const {
    manifest: merged,
    added,
    shadowed
  } = LocalProfiles.merge(manifest, LocalProfiles.entriesFrom(directories));
  if (added.length) console.log(`  local profiles: ${added.join(', ')}`);
  for (const name of shadowed) {
    console.warn(`  applications/${name} ignored: a published profile of that name already exists`);
  }
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/**
 * Build a static server for `root` that forbids caching.
 *
 * Two kinds of path are never handed to just anyone. A hidden path — `.git/`, `.claude/`, any segment
 * starting with a dot — is never served at all: the page needs none of them, and `.git/` holds the
 * whole history. `applications/`, and the manifest merged with it, are served only to this machine's
 * browser holding the run's key: a tailored CV must still preview locally, and must never be readable
 * from another device or through a relay. Both rules are checked against the path requested and again
 * against where the file really is, so a link inside the tree cannot carry a request past them.
 *
 * The key reaches the browser once, in the address the server prints: `?key=` is traded for a cookie,
 * and the browser is sent on to the same address without it. A server handed no key makes its own,
 * which nobody holds — so by default nothing private is served at all.
 * @param {string} root - Directory to serve
 * @param {object} [options] - Who may see what
 * @param {(request: import('node:http').IncomingMessage) => boolean} [options.isLocal] - How to tell a
 *   request from this machine; tests hand in their own
 * @param {string} [options.key] - This run's key, from `previewKey`
 * @returns {import('node:http').Server} A server, not yet listening
 */
export function createStaticServer(
  root = projectRoot,
  { isLocal = isFromThisMachine, key = previewKey() } = {}
) {
  const realRoot = realpathSync.native(root);
  const notFound = (response) =>
    response.writeHead(404, { 'Cache-Control': 'no-store' }).end('Not found');
  // Where a file really is, when the rules let it be served: a link inside the tree can point into
  // .git/, into applications/, or out of the tree altogether. Null when it is missing or refused.
  const servable = async (path, trusted) => {
    try {
      const file = await realpathOf(path);
      return mayServe(relative(realRoot, file), trusted) ? file : null;
    } catch {
      return null;
    }
  };

  return createServer(async (request, response) => {
    let target;
    let address;
    try {
      address = new URL(request.url, 'http://localhost');
      target = resolve(request.url, root);
    } catch {
      // `/%ZZ` or `//` names no path. Thrown outside the try below, it would take the server down.
      response.writeHead(400, { 'Cache-Control': 'no-store' }).end('Bad request');
      return;
    }
    if (!target) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const cookieName = keyCookie(request.socket.localPort);
    if (address.searchParams.has('key')) {
      // The address the server printed. The key is traded for a cookie and the browser sent on without
      // it, so it stays out of history, bookmarks and every Referer the page sends. A wrong key is
      // dropped the same way, and buys nothing.
      const offered = address.searchParams.get('key');
      address.searchParams.delete('key');
      const headers = {
        Location: `${address.pathname}${address.search}`,
        'Cache-Control': 'no-store'
      };
      if (isKey(offered, key)) {
        headers['Set-Cookie'] = `${cookieName}=${key}; HttpOnly; SameSite=Strict; Path=/`;
      }
      response.writeHead(303, headers).end();
      return;
    }

    // Both, or nothing private: a request this machine's browser sent directly, which refuses a proxy
    // and another site's name, and the key it was handed at start, which refuses a raw relay (#71).
    const trusted = isLocal(request) && isKey(cookieValue(request.headers.cookie, cookieName), key);
    if (!mayServe(relative(root, target), trusted)) {
      notFound(response);
      return;
    }

    if (
      trusted &&
      target === join(root, 'config', 'cv-manifest.json') &&
      (await servable(target, trusted))
    ) {
      const body = await localManifest(root);
      if (body !== null) {
        response.writeHead(200, {
          'Content-Type': types.get('.json'),
          'Content-Length': Buffer.byteLength(body),
          'Cache-Control': 'no-store, must-revalidate'
        });
        response.end(body);
        return;
      }
    }

    try {
      const info = await stat(target);
      const file = await servable(
        info.isDirectory() ? join(target, 'index.html') : target,
        trusted
      );
      if (!file) {
        notFound(response);
        return;
      }
      response.writeHead(200, {
        'Content-Type': types.get(extname(file)) || 'application/octet-stream',
        'Content-Length': (await stat(file)).size,
        'Cache-Control': 'no-store, must-revalidate'
      });
      createReadStream(file).pipe(response);
    } catch {
      notFound(response);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port, host, network } = listenSettings(process.argv.slice(2), process.env);
  const key = previewKey();
  createStaticServer(projectRoot, { key }).listen(port, host, () => {
    console.log(`serving ${projectRoot} on ${host}:${port} with no-store`);
    console.log(
      network
        ? '  open to the network (--network): any device that can reach this machine loads the page; applications/ stays on this machine'
        : '  this machine only; pass --network to reach another device'
    );
    console.log(`  http://localhost:${port}/index.html?layout=nerd`);
    console.log(
      `  a CV from applications/ needs this run's key, once: http://localhost:${port}/index.html?key=${key}`
    );
  });
}

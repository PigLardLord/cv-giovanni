import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { LocalProfiles } from '../core/LocalProfiles.js';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
 * @param {string} root - Directory to serve
 * @returns {import('node:http').Server} A server, not yet listening
 */
export function createStaticServer(root = projectRoot) {
  return createServer(async (request, response) => {
    const target = resolve(request.url, root);
    if (!target) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    if (target === join(root, 'config', 'cv-manifest.json')) {
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
      const file = info.isDirectory() ? join(target, 'index.html') : target;
      const size = info.isDirectory() ? (await stat(file)).size : info.size;
      response.writeHead(200, {
        'Content-Type': types.get(extname(file)) || 'application/octet-stream',
        'Content-Length': size,
        'Cache-Control': 'no-store, must-revalidate'
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end('Not found');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || process.env.PORT || 8080);
  createStaticServer().listen(port, () => {
    console.log(`serving ${projectRoot} on http://localhost:${port} with no-store`);
    console.log(`  http://localhost:${port}/index.html?layout=nerd`);
  });
}

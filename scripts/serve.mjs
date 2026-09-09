import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);

const types = new Map(Object.entries({
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
}));

/** Resolve a request path inside the project, or null when it escapes it. */
function resolve(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const target = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  return target === root.replace(/[\\/]$/, '') || target.startsWith(root) ? target : null;
}

createServer(async (request, response) => {
  const target = resolve(request.url);
  if (!target) {
    response.writeHead(403).end('Forbidden');
    return;
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
}).listen(port, () => {
  console.log(`serving ${root} on http://localhost:${port} with no-store`);
  console.log(`  http://localhost:${port}/index.html?layout=nerd`);
});

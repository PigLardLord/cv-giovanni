import { Refusal } from '../core/Refusal.js';

/**
 * The local app's API (#21), in front of the services the command line shares.
 *
 * CLAUDE.md: never put business logic in the views. Each route below hands its request to one service
 * method and nothing else, and `tests/LocalApi.test.js` reads this table as source and fails when a route
 * does more. What stays here is HTTP: finding the route, reading JSON in, writing JSON out, and turning a
 * service's refusal into its status. The development server decides who may call it at all.
 */
export const ROUTES = [
  { method: 'GET', path: /^\/api\/profile$/, call: (services) => services.profile.read() },
  {
    method: 'GET',
    path: /^\/api\/inference$/,
    call: (services) => services.inference.status()
  },
  {
    method: 'PUT',
    path: /^\/api\/profile$/,
    call: (services, { body }) => services.profile.write(body)
  },
  {
    method: 'POST',
    path: /^\/api\/applications$/,
    call: (services, { body }) => services.applications.create(body)
  },
  {
    method: 'POST',
    path: /^\/api\/applications\/([^/]+)\/match$/,
    call: (services, { name }) => services.applications.match(name)
  },
  {
    method: 'POST',
    path: /^\/api\/applications\/([^/]+)\/tailor$/,
    call: (services, { name }) => services.applications.tailor(name)
  },
  {
    method: 'POST',
    path: /^\/api\/applications\/([^/]+)\/build$/,
    call: (services, { name }) => services.applications.build(name)
  }
];

/** Writes one JSON answer, never cached. */
function answer(response, status, value, headers = {}) {
  const body = `${JSON.stringify(value ?? null)}\n`;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end(body);
}

/**
 * The request's body as text, or null when it passes `limit` bytes. A body past the limit is still read to
 * its end and dropped: closing the connection while the client is sending loses the answer that says why.
 */
function bodyOf(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    request.on('end', () => resolve(size > limit ? null : Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

/**
 * Answers one request to `/api/`.
 * @param {import('node:http').IncomingMessage} request - The request
 * @param {import('node:http').ServerResponse} response - Where the answer goes
 * @param {{ profile: object, applications: object }} services - The services the routes call
 * @param {{ maxBody?: number }} [options] - The largest body taken, in bytes
 */
export async function handleApi(request, response, services, { maxBody = 1024 * 1024 } = {}) {
  const { pathname } = new URL(request.url, 'http://localhost');
  const matching = ROUTES.map((route) => ({ route, match: route.path.exec(pathname) })).filter(
    ({ match }) => match
  );
  if (!matching.length) {
    answer(response, 404, { error: `No endpoint at ${pathname}.` });
    return;
  }
  const found = matching.find(({ route }) => route.method === request.method);
  if (!found) {
    answer(
      response,
      405,
      { error: `${pathname} does not take ${request.method}.` },
      { Allow: matching.map(({ route }) => route.method).join(', ') }
    );
    return;
  }

  let body;
  if (request.method !== 'GET') {
    if (!/^application\/json(;|$)/i.test(request.headers['content-type'] || '')) {
      answer(response, 415, { error: 'Send JSON, as Content-Type: application/json.' });
      return;
    }
    let text;
    try {
      text = await bodyOf(request, maxBody);
    } catch {
      // The client went away while it sent the body. There is no one to answer, and a rejection let out of here
      // would take the server down, with every page and build it serves.
      return;
    }
    if (text === null) {
      answer(
        response,
        413,
        { error: `A request body is at most ${maxBody} bytes.` },
        { Connection: 'close' }
      );
      return;
    }
    try {
      body = text.trim() ? JSON.parse(text) : undefined;
    } catch {
      answer(response, 400, { error: 'The request body is not valid JSON.' });
      return;
    }
  }

  let name;
  try {
    name = found.match[1] === undefined ? undefined : decodeURIComponent(found.match[1]);
  } catch {
    answer(response, 400, { error: 'The address does not name an application.' });
    return;
  }

  try {
    answer(response, 200, await found.route.call(services, { body, name }));
  } catch (error) {
    if (error instanceof Refusal) {
      answer(
        response,
        error.status,
        error.details ? { error: error.message, problems: error.details } : { error: error.message }
      );
      return;
    }
    // The detail can carry a path on this machine: it goes to the terminal, not into the answer.
    console.error(error);
    answer(response, 500, { error: 'The local app failed: the terminal running it says why.' });
  }
}

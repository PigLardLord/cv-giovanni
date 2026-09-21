/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { jest } from '@jest/globals';
import { handleApi, ROUTES } from '../adapters/LocalApi.js';
import { Refusal } from '../core/Refusal.js';

// CLAUDE.md: never put business logic in the views. With a local app in front of the pipeline that stops
// being advice (#21): every endpoint hands its request to one service method, the one the command line
// shares, and sends back what it returns. This is what fails when a route starts deciding something.

/** Services that answer every call with a value naming the call, and remember it. */
const recording = (overrides = {}) => {
  const calls = [];
  const method = (service, name) =>
    overrides[`${service}.${name}`] ||
    (async (argument) => {
      calls.push([`${service}.${name}`, argument]);
      return { answeredBy: `${service}.${name}` };
    });
  return {
    calls,
    services: {
      profile: { read: method('profile', 'read'), write: method('profile', 'write') },
      inference: { status: method('inference', 'status') },
      applications: Object.fromEntries(
        ['create', 'match', 'build'].map((name) => [name, method('applications', name)])
      ),
      tailorings: { create: method('tailorings', 'create'), status: method('tailorings', 'status') }
    }
  };
};

let server;
let origin;
const serve = async (services, options) => {
  server = createServer((request, response) => handleApi(request, response, services, options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
};
const call = async (method, path, { body, type = 'application/json' } = {}) => {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': type },
    body
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
};

afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});

describe('the local API passes every request through', () => {
  const application = { name: 'acme', advert: 'Senior iOS Engineer' };

  test.each([
    ['GET', '/api/profile', undefined, ['profile.read', undefined]],
    ['GET', '/api/inference', undefined, ['inference.status', undefined]],
    [
      'PUT',
      '/api/profile',
      { name: 'Giovanni Trovato' },
      ['profile.write', { name: 'Giovanni Trovato' }]
    ],
    ['POST', '/api/applications', application, ['applications.create', application]],
    ['POST', '/api/applications/acme/match', undefined, ['applications.match', 'acme']],
    ['POST', '/api/applications/acme/build', undefined, ['applications.build', 'acme']],
    [
      'GET',
      '/api/tailorings/20260921-143205-a1b2c3',
      undefined,
      ['tailorings.status', '20260921-143205-a1b2c3']
    ]
  ])(
    '%s %s reaches one service method, and answers with what it returned',
    async (method, path, body, expected) => {
      const { calls, services } = recording();
      await serve(services);

      const response = await call(method, path, { body: body && JSON.stringify(body) });

      expect(calls).toEqual([expected]);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ answeredBy: expected[0] });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  );

  // The route table is read as source: a route is one call to one service method, with the one value the
  // request carries, or nothing. A condition, a transformation or a second call is logic in the view.
  const PASS_THROUGH = /^\(services(?:, \{ (body|name) \})?\) => services\.\w+\.\w+\(\1?\)$/;
  const passesThrough = (call) => PASS_THROUGH.test(call.toString().replace(/\s+/g, ' ').trim());

  test('every route is one call to one service method, and the check catches one that is not', () => {
    expect(ROUTES.map(({ method, path }) => `${method} ${path.source}`)).toHaveLength(8);
    expect(ROUTES.filter(({ call }) => !passesThrough(call))).toEqual([]);

    const leaking = [
      (services, { body }) => services.profile.write({ ...body, name: body.name.trim() }),
      (services, { name }) => (name ? services.applications.build(name) : null),
      (services, { name }) => services.applications.match(name.toLowerCase()),
      (services) => services.profile.read().then((profile) => profile.name)
    ];
    expect(leaking.filter(passesThrough)).toEqual([]);
  });

  test('the API imports nothing that could decide or read anything', () => {
    const source = readFileSync(new URL('../adapters/LocalApi.js', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(([, from]) => from);

    expect(imports).toEqual(['../core/Refusal.js']);
  });
});

describe('what the local API answers when a request goes wrong', () => {
  test('a refusal reaches the caller with its status and its reason', async () => {
    const { services } = recording({
      'applications.match': async () => {
        throw new Refusal(404, 'No application named "nobody".');
      }
    });
    await serve(services);

    const response = await call('POST', '/api/applications/nobody/match');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No application named "nobody".' });
  });

  test('a refusal with problems hands them over, each with its path and its reason', async () => {
    const problems = [
      { path: 'relevant_experience[0].period', reason: 'carries more than its dates' }
    ];
    const { services } = recording({
      'profile.write': async () => {
        throw new Refusal(422, 'The profile cannot be saved.', problems);
      }
    });
    await serve(services);

    const response = await call('PUT', '/api/profile', { body: '{"name":"Giovanni Trovato"}' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: 'The profile cannot be saved.', problems });
  });

  test('any other failure is a 500 that gives away nothing about the machine', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { services } = recording({
      'profile.read': async () => {
        throw new Error("ENOENT: no such file, open '/home/someone/private/en.json'");
      }
    });
    await serve(services);

    const response = await call('GET', '/api/profile');
    quiet.mockRestore();

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/home|someone|ENOENT/);
  });

  test('a body that is not JSON is refused before any service runs', async () => {
    const { calls, services } = recording();
    await serve(services);

    expect(
      (await call('PUT', '/api/profile', { body: 'name=Giovanni', type: 'text/plain' })).status
    ).toBe(415);
    expect((await call('PUT', '/api/profile', { body: '{"name":' })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  test('a body larger than the API takes is refused before any service runs', async () => {
    const { calls, services } = recording();
    await serve(services, { maxBody: 64 });

    const response = await call('PUT', '/api/profile', {
      body: JSON.stringify({ name: 'x'.repeat(100) })
    });

    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  // A tailoring takes minutes: the call answers at once that the job is accepted, and the client polls its state.
  test('POST /api/tailorings reaches one service method, and answers 202 with what it returned', async () => {
    const { calls, services } = recording();
    await serve(services);

    const response = await call('POST', '/api/tailorings', {
      body: JSON.stringify({ advert: 'Senior iOS Engineer' })
    });

    expect(calls).toEqual([['tailorings.create', { advert: 'Senior iOS Engineer' }]]);
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ answeredBy: 'tailorings.create' });
  });

  test('the application route that answered 501 for tailoring is gone', async () => {
    const { calls, services } = recording();
    await serve(services);

    expect((await call('POST', '/api/applications/acme/tailor')).status).toBe(404);
    expect(calls).toEqual([]);
  });

  test('an endpoint that does not exist is a 404, and a method it does not take a 405', async () => {
    const { calls, services } = recording();
    await serve(services);

    expect((await call('GET', '/api/nothing')).status).toBe(404);
    const wrong = await call('DELETE', '/api/profile');
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('GET, PUT');
    expect(wrong.headers.get('cache-control')).toBe('no-store');
    expect(calls).toEqual([]);
  });

  test('an application name that does not decode is refused before any service runs', async () => {
    const { calls, services } = recording();
    await serve(services);

    expect((await call('POST', '/api/applications/%E0%A4%A/build')).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

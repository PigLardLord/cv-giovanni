/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '../adapters/LocalApi.js';

// The first real tailoring was driven by curl, and every answer it needed had to be found in the code (#384).
// docs/LOCAL_API.md is the reference now, and a reference that names an endpoint the server no longer has, or misses
// one it gained, is worse than none: it is believed. So each route is a heading there, and each heading a route.
const root = fileURLToPath(new URL('..', import.meta.url));
const reference = readFileSync(join(root, 'docs', 'LOCAL_API.md'), 'utf8');
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;

/** A route as the reference writes it: `POST /api/applications/{}/match`, its parameter's name left out. */
const written = ({ method, path }) =>
  `${method} ${path.source
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replaceAll('([^/]+)', '{}')
    .replaceAll('\\/', '/')}`;

/** Every endpoint a markdown text documents: its `### METHOD /api/…` headings, parameters as `{}`. */
const documented = (markdown) =>
  [...markdown.matchAll(/^### (GET|PUT|POST|DELETE|PATCH) (\/api\/\S*)$/gm)].map(
    ([, method, path]) => `${method} ${path.replace(/\{[^}]*\}/g, '{}')}`
  );

const undocumented = (markdown) =>
  ROUTES.map(written).filter((route) => !documented(markdown).includes(route));
const unrouted = (markdown) =>
  documented(markdown).filter((endpoint) => !ROUTES.map(written).includes(endpoint));

/**
 * Inline code that reads as a path in the repository: a slash, no placeholder, no address, no media type. A bare
 * filename here is a file of a job's directory, `state.json`, which the table beside it places.
 */
const namedPaths = (markdown) => [
  ...new Set(
    [...markdown.matchAll(/`([^`\n]+)`/g)]
      .map(([, code]) => code.trim())
      .filter((code) => /^[\w.@-]+(\/[\w.@-]*)+$/.test(code))
      .filter((code) => !/^(application|text|image|font)\//.test(code))
  )
];
const ignoredOnPurpose = (path) => {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: root });
    return true;
  } catch {
    return false;
  }
};

describe('docs/LOCAL_API.md documents the local API the server has', () => {
  test('the check finds a route left out, and an endpoint the server does not have', () => {
    const stale = [
      '### GET /api/profile',
      '### PUT /api/profile',
      '### DELETE /api/applications/{name}'
    ].join('\n');

    expect(undocumented(stale)).toContain('POST /api/tailorings');
    expect(unrouted(stale)).toEqual(['DELETE /api/applications/{}']);
    expect(namedPaths('`core/Nowhere.js`, `state.json`, `application/pdf`')).toEqual([
      'core/Nowhere.js'
    ]);
  });

  test('every route in adapters/LocalApi.js has its heading', () => {
    expect(undocumented(reference)).toEqual([]);
  });

  test('every endpoint it documents is a route', () => {
    expect(unrouted(reference)).toEqual([]);
  });

  test('each endpoint is documented once', () => {
    const endpoints = documented(reference);
    expect(endpoints.filter((endpoint, index) => endpoints.indexOf(endpoint) !== index)).toEqual(
      []
    );
  });

  test('every file of the repository it names exists, or is ignored on purpose', () => {
    expect(
      namedPaths(reference).filter(
        (path) =>
          !path.startsWith('applications/') &&
          !existsSync(join(root, path)) &&
          !ignoredOnPurpose(path)
      )
    ).toEqual([]);
  });

  test('every npm script it names is defined', () => {
    const named = [
      ...new Set([...reference.matchAll(/npm run ([\w:-]+)/g)].map(([, name]) => name))
    ];
    expect(named.filter((name) => !scripts[name])).toEqual([]);
  });
});

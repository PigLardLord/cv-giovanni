/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// .claude/launch.json is what the desktop app's preview reads to start a local server: the first
// thing an agent reaches for to check a change in a browser. It ran `python -m http.server`, which
// sends no Cache-Control, and whose heuristic caching has shown this project a stale page three
// times. AGENTS.md: use `npm run serve`, and do not trust a local page served any other way (#57).
const launch = JSON.parse(
  readFileSync(fileURLToPath(new URL('../.claude/launch.json', import.meta.url)), 'utf8')
);

/** The command line a configuration runs, as one string. */
const commandOf = (configuration) =>
  [configuration.runtimeExecutable, ...(configuration.runtimeArgs || [])].join(' ');

// `-m http.server`, or the module glued to the end of a cluster of python flags: `-Bmhttp.server`.
const usesHttpServer = (configuration) =>
  /(?:^|\s)(?:-\w*m\s*)?http\.server\b/.test(commandOf(configuration));

/** The runtime by name, whatever path it is given by. */
const runtimeOf = (configuration) =>
  basename(configuration.runtimeExecutable || '').replace(/\.exe$/i, '');

const usesProjectServer = (configuration) => {
  const args = configuration.runtimeArgs || [];
  if (runtimeOf(configuration) === 'npm') return args[0] === 'run' && args[1] === 'serve';
  return (
    runtimeOf(configuration) === 'node' &&
    args.some((arg) => /(?:^|[\\/])scripts[\\/]serve\.mjs$/.test(arg))
  );
};

describe('the preview serves the site with the project’s own server', () => {
  // The check has to be able to fail, and this pair is where that is proved.
  test('a python http.server entry is recognised, and the project server is not mistaken for one', () => {
    const python = { runtimeExecutable: 'python3', runtimeArgs: ['-m', 'http.server', '8080'] };
    const node = { runtimeExecutable: 'node', runtimeArgs: ['scripts/serve.mjs', '8123'] };

    expect([usesHttpServer(python), usesProjectServer(python)]).toEqual([true, false]);
    expect([usesHttpServer(node), usesProjectServer(node)]).toEqual([false, true]);
  });

  // Python takes a module glued to its flag, even behind other flags: every spelling that starts
  // http.server has to be caught.
  test.each([
    [['-m', 'http.server', '8080']],
    [['-mhttp.server', '8099']],
    [['-u', '-mhttp.server']],
    [['-Bmhttp.server']]
  ])('python3 %j is recognised as http.server', (runtimeArgs) => {
    expect(usesHttpServer({ runtimeExecutable: 'python3', runtimeArgs })).toBe(true);
  });

  // A runtime named by its full path, a flag before the script, or the npm script CLAUDE.md names
  // all start the same server.
  test.each([
    { runtimeExecutable: '/usr/bin/node', runtimeArgs: ['scripts/serve.mjs', '8123'] },
    { runtimeExecutable: 'node', runtimeArgs: ['--no-warnings', './scripts/serve.mjs'] },
    { runtimeExecutable: 'npm', runtimeArgs: ['run', 'serve', '--', '8123'] }
  ])('$runtimeExecutable $runtimeArgs starts the project server', (configuration) => {
    expect([usesHttpServer(configuration), usesProjectServer(configuration)]).toEqual([
      false,
      true
    ]);
  });

  test('another script, or the right script under another runtime, is not the project server', () => {
    const audit = { runtimeExecutable: 'node', runtimeArgs: ['scripts/audit-print.mjs'] };
    const python = { runtimeExecutable: 'python3', runtimeArgs: ['scripts/serve.mjs'] };

    expect([usesProjectServer(audit), usesProjectServer(python)]).toEqual([false, false]);
  });

  test('no configuration runs python’s http.server', () => {
    expect(
      launch.configurations.filter(usesHttpServer).map((configuration) => configuration.name)
    ).toEqual([]);
  });

  test('a configuration starts scripts/serve.mjs, which sends no-store', () => {
    expect(launch.configurations.some(usesProjectServer)).toBe(true);
  });
});

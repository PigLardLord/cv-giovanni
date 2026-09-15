/**
 * @jest-environment node
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeScripts } from '../adapters/NodeScripts.js';

// Building a CV or matching an advert from the local app runs the same script `npm run` does (#21), with
// an argument list and no shell: a character in an application's name must never become a command.
describe('the project scripts, run for the local app', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scripts-'));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(
      join(root, 'scripts', 'audit-ats.mjs'),
      "console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\nconsole.error('a line on stderr');\nprocess.exit(3);\n"
    );
    writeFileSync(
      join(root, 'scripts', 'generate-pdfs.mjs'),
      'setTimeout(() => console.log("done"), 5000);\n'
    );
    writeFileSync(join(root, 'scripts', 'serve.mjs'), 'console.log("served");\n');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test('runs a script from the project root with its arguments, and hands back how it ended', async () => {
    const result = await new NodeScripts(root).run('audit-ats', [
      '--profile=applications/acme/en.json'
    ]);

    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ['--profile=applications/acme/en.json'],
      cwd: realpathSync(root)
    });
    expect(result.stderr).toBe('a line on stderr\n');
  });

  test('passes an argument that looks like a command through as one argument, and runs nothing else', async () => {
    const hostile = '--profile=applications/$(touch pwned)/en.json; touch pwned';
    const result = await new NodeScripts(root).run('audit-ats', [hostile]);

    expect(JSON.parse(result.stdout).args).toEqual([hostile]);
    expect(existsSync(join(root, 'pwned'))).toBe(false);
  });

  test.each(['serve', '../scripts/audit-ats', 'audit-ats.mjs', ''])(
    'refuses to run "%s", which is not one of its scripts',
    async (name) => {
      await expect(new NodeScripts(root).run(name, [])).rejects.toThrow(/not a script/);
    }
  );

  test('stops a script that runs past its time, and says so', async () => {
    const result = await new NodeScripts(root, { timeout: 300 }).run('generate-pdfs', []);

    expect(result.exitCode).toBeNull();
    expect(result.signal).toBe('SIGTERM');
  });
});

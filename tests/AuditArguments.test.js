/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// #258 read `--profile <path>` as `--profile=<path>` through one parser. The audits' own options did not follow:
// `--advert x` and `--base x` were ignored without a word, so audit:ats scored the CV against no advert and
// audit-ats-base compared against origin/main (#272). Both now read the options through the same parser.
const root = fileURLToPath(new URL('..', import.meta.url));
const run = (script, args) =>
  spawnSync(process.execPath, [`scripts/${script}`, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_BASE_REF: '' },
    timeout: 60_000
  });

describe('the audits read their options written either way', () => {
  test.each([[['--advert=/nowhere/advert.txt']], [['--advert', '/nowhere/advert.txt']]])(
    'audit-ats reads %j as the advert to match',
    (advert) => {
      const { status, stderr } = run('audit-ats.mjs', [
        '--profile=profiles/general/en.json',
        ...advert
      ]);

      expect(stderr).toMatch(/cannot read the advert at \/nowhere\/advert\.txt/);
      expect(status).toBe(2);
    }
  );

  test.each([[['--base=no-such-ref-272']], [['--base', 'no-such-ref-272']]])(
    'audit-ats-base reads %j as the base to compare with',
    (base) => {
      const { status, stderr } = run('audit-ats-base.mjs', base);

      expect(stderr).toMatch(/cannot find where HEAD left no-such-ref-272/);
      expect(status).toBe(2);
    }
  );

  test.each([
    ['audit-ats.mjs', ['--profile=profiles/general/en.json', '--advert'], /--advert=<path>/],
    ['audit-ats.mjs', ['--advert'], /--advert=<path>/],
    ['audit-ats-base.mjs', ['--base'], /--base=<ref>/],
    ['audit-ats-base.mjs', ['--base='], /--base=<ref>/]
  ])('%s %j with no value is refused, saying how to write it', (script, args, shape) => {
    const { status, stderr } = run(script, args);

    expect(stderr).toMatch(/needs a value/);
    expect(stderr).toMatch(shape);
    expect(status).toBe(2);
  });
});

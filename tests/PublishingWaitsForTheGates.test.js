/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';

// A merge to main publishes, and nothing else does (#45). GitHub Pages deploys the site the gates job
// assembled, only for a push to main, and only after every gate passed. #63 is what a road around the
// gates cost: an empty public CV for 48 minutes. Prettier lays the workflow out, so its jobs and steps
// can be read as text, without a YAML parser the project does not depend on.
const workflows = new URL('../.github/workflows/', import.meta.url);
const gates = readFileSync(new URL('gates.yml', workflows), 'utf8');
const ON_MAIN = "if: github.event_name == 'push' && github.ref == 'refs/heads/main'";

/** One job's lines, from its key under `jobs:` to the next job's key. */
const job = (text, name) => {
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 2);
};

/** What would let the site go live without every gate, or anywhere but from main. */
const problems = (text) => {
  const gatesJob = job(text, 'gates');
  const deploy = job(text, 'deploy');
  if (!gatesJob || !deploy) return ['a gates or a deploy job is missing'];

  const found = [];
  if (!/^ {4}needs: gates$/m.test(deploy)) found.push('deploy does not wait for gates');
  if (!deploy.includes(`\n    ${ON_MAIN}\n`)) found.push('deploy is not limited to a push to main');
  if (/always\(\)|failure\(\)|cancelled\(\)|continue-on-error/.test(deploy)) {
    found.push('deploy can follow a failed gate');
  }
  if (/continue-on-error/.test(gatesJob)) found.push('a gate can fail without failing its job');
  if (/^ {2}cancel-in-progress: true$/m.test(text))
    found.push('a newer run can cancel a deploy on main');

  const upload = gatesJob.indexOf('uses: actions/upload-pages-artifact@');
  if (upload < 0) return [...found, 'gates hands Pages no site'];
  const uploadStep = gatesJob.slice(gatesJob.lastIndexOf('- name:', upload), upload);
  if (!uploadStep.includes(ON_MAIN)) found.push('the site is handed over beyond main');
  if (upload < gatesJob.indexOf('run: npm run audit:screen')) {
    found.push('the site is handed over before the last audit');
  }
  return found;
};

describe('publishing waits for the gates', () => {
  test('the check finds a deploy that does not wait, or runs whatever happened', () => {
    const impatient = gates.replace('    needs: gates\n', '');
    const unconditional = gates.replace(
      `\n    ${ON_MAIN}\n    runs-on`,
      '\n    if: always()\n    runs-on'
    );

    expect(impatient).not.toBe(gates);
    expect(unconditional).not.toBe(gates);
    const hasty = gates.replace(/^( {2}cancel-in-progress:).*$/m, '$1 true');
    expect(hasty).not.toBe(gates);
    expect(problems(hasty)).toContain('a newer run can cancel a deploy on main');
    expect(problems(impatient)).toContain('deploy does not wait for gates');
    expect(problems(unconditional)).toEqual(
      expect.arrayContaining([
        'deploy is not limited to a push to main',
        'deploy can follow a failed gate'
      ])
    );
  });

  test('the site goes live from main only, after every gate on that commit passed', () => {
    expect(problems(gates)).toEqual([]);
  });

  test('no other workflow publishes', () => {
    const others = readdirSync(workflows)
      .filter((name) => name !== 'gates.yml')
      .filter((name) =>
        /deploy-pages|upload-pages-artifact/.test(readFileSync(new URL(name, workflows), 'utf8'))
      );

    expect(others).toEqual([]);
  });
});

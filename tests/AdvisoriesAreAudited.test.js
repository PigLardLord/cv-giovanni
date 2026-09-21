/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// Nine advisories, one critical, sat in the dependency tree until someone ran `npm audit` by hand (#267). #280 keeps
// that rule by a workflow: on every pull request and every week, not a check the merge ruleset requires, because the
// advisory database changes without a commit, and a required check could block a branch for what the branch never did.
const workflow = readFileSync(
  new URL('../.github/workflows/advisories.yml', import.meta.url),
  'utf8'
);

/** What would let a high or critical advisory sit in the tree unseen, or block a merge that did not cause it. */
const problems = (text) => {
  const found = [];
  if (!/^ {2}pull_request:/m.test(text)) found.push('it does not run on pull requests');
  if (!/^ {2}schedule:\n {4}- cron: '[^']+'$/m.test(text))
    found.push('it does not run on a schedule');
  if (!/^ {8}run: npm audit --package-lock-only --audit-level=high$/m.test(text)) {
    found.push('it does not fail on a high or critical advisory');
  }
  if (/continue-on-error/.test(text)) found.push('a finding can pass without failing its job');
  if (/^ {2}gates:$/m.test(text))
    found.push('its job is named gates, the check the ruleset requires');
  return found;
};

describe('the dependency tree’s advisories', () => {
  test('are audited on every pull request and every week, failing on high or critical', () => {
    expect(problems(workflow)).toEqual([]);
  });

  test('and the check finds a workflow that would let one through', () => {
    expect(problems(workflow.replace('--audit-level=high', '--audit-level=critical'))).toEqual([
      'it does not fail on a high or critical advisory'
    ]);
    expect(problems(workflow.replace(/^ {2}schedule:\n.*\n/m, ''))).toEqual([
      'it does not run on a schedule'
    ]);
    expect(problems(workflow.replace(/^ {2}advisories:$/m, '  gates:'))).toEqual([
      'its job is named gates, the check the ruleset requires'
    ]);
  });
});

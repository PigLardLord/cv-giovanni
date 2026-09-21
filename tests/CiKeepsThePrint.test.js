/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// A print that differs on CI from a developer's cannot be examined unless CI keeps it (#301): the fixture check fails
// there, and the PDFs it read are gone when the job ends. The run's artefact now holds them beside the reports.
const gates = readFileSync(new URL('../.github/workflows/gates.yml', import.meta.url), 'utf8');

const COLLECT = '- name: Collect the reports and the print this run wrote';
const KEEP = '- name: Keep them';

/** One step of a workflow: from its name to the next step's, or the next job's. */
const step = (text, name) => {
  const start = text.indexOf(name);
  if (start < 0) return null;
  const rest = text.slice(start + name.length);
  const end = rest.search(/\n {6}- name:|\n {2}\S/);
  return name + (end < 0 ? rest : rest.slice(0, end));
};

/** What stops a run from keeping its print whatever its outcome. */
const problems = (text) => {
  const found = [];
  const collect = step(text, COLLECT);
  const keep = step(text, KEEP);
  if (!collect) return ['no step collects the print'];
  if (!keep) return ['no step uploads what was collected'];
  if (!/^ {8}if: always\(\)$/m.test(collect)) found.push('the print is collected only on success');
  if (
    !/find generated -maxdepth 1 -name '\*\.pdf' -newer "\$RUNNER_TEMP\/run-started" -exec cp \{\} "\$RUNNER_TEMP\/audit-reports\/printed\/"/.test(
      collect
    )
  ) {
    found.push('the PDFs are not copied beside the reports');
  }
  if (!/^ {8}if: always\(\)$/m.test(keep)) found.push('the artefact is uploaded only on success');
  if (!/^ {10}path: \$\{\{ runner\.temp \}\}\/audit-reports\/$/m.test(keep)) {
    found.push('the artefact does not hold the whole directory');
  }
  return found;
};

describe('a CI run', () => {
  test('keeps the PDFs it printed in the artefact it uploads, whatever the run’s outcome', () => {
    expect(problems(gates)).toEqual([]);
  });

  test('the check finds a step that runs only on success, or an upload that leaves the PDFs out', () => {
    const onlyCollectOnSuccess = gates.replace(
      `${COLLECT}\n        if: always()\n`,
      `${COLLECT}\n`
    );
    const onlyKeepOnSuccess = gates.replace(`${KEEP}\n        if: always()\n`, `${KEEP}\n`);
    const reportsOnly = gates.replace(
      'path: ${{ runner.temp }}/audit-reports/\n',
      'path: ${{ runner.temp }}/audit-reports/*.md\n'
    );
    for (const mutated of [onlyCollectOnSuccess, onlyKeepOnSuccess, reportsOnly]) {
      expect(mutated).not.toBe(gates);
    }

    expect(problems(onlyCollectOnSuccess)).toEqual(['the print is collected only on success']);
    expect(problems(onlyKeepOnSuccess)).toEqual(['the artefact is uploaded only on success']);
    expect(problems(reportsOnly)).toEqual(['the artefact does not hold the whole directory']);
  });
});

/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// A print that differs on CI from a developer's cannot be examined unless CI keeps it (#301): the fixture check fails
// there, and the PDFs it read are gone when the job ends. The run's artefact now holds them beside the reports.
const gates = readFileSync(new URL('../.github/workflows/gates.yml', import.meta.url), 'utf8');

describe('a CI run', () => {
  test('keeps the PDFs it printed in the artefact it uploads, whatever the run’s outcome', () => {
    const collect = gates.slice(
      gates.indexOf('- name: Collect the reports and the print this run wrote')
    );
    expect(collect).toMatch(/^ {8}if: always\(\)$/m);
    expect(collect).toMatch(
      /find generated -maxdepth 1 -name '\*\.pdf' -newer "\$RUNNER_TEMP\/run-started" -exec cp \{\} "\$RUNNER_TEMP\/audit-reports\/printed\/"/
    );
    expect(gates).toMatch(/path: \$\{\{ runner\.temp \}\}\/audit-reports\//);
  });
});

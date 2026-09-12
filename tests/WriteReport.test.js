/**
 * @jest-environment node
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeReport } from '../scripts/lib/write-report.mjs';

describe('an audit report', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'report-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // A tailored profile that was never built has no out/ directory yet, and its report goes there (#94).
  test('is written where no directory exists yet', async () => {
    const file = pathToFileURL(join(root, 'applications', 'acme', 'out', 'PRINT_AUDIT.md'));

    await writeReport(file, '# Print quality matrix\n');

    expect(readFileSync(file, 'utf8')).toBe('# Print quality matrix\n');
  });

  test('replaces the report an earlier run wrote', async () => {
    const file = pathToFileURL(join(root, 'SCREEN_AUDIT.md'));

    await writeReport(file, 'earlier\n');
    await writeReport(file, 'later\n');

    expect(readFileSync(file, 'utf8')).toBe('later\n');
  });
});

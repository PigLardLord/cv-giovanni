import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes an audit's report, making its directory first.
 *
 * A tailored profile's report goes beside the profile, in `applications/<name>/out/`, and only
 * `npm run build:pdf` used to create that directory. The print and screen audits need no build. On a
 * profile that was never built they checked every layout and then crashed writing the report: exit 1,
 * the code for a failed check, and no report at all (#94).
 * @param {URL} file - Where the report goes
 * @param {string} text - The report
 * @returns {Promise<void>} Resolves once the report is on disk
 */
export async function writeReport(file, text) {
  await mkdir(dirname(fileURLToPath(file)), { recursive: true });
  await writeFile(file, text);
}

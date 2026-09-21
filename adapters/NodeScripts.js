import { execFile } from 'node:child_process';

/** The scripts the local app may run, by the name its services use: the ones `npm run` runs. */
const SCRIPTS = {
  'generate-pdfs': 'scripts/generate-pdfs.mjs',
  'audit-ats': 'scripts/audit-ats.mjs',
  'audit-print': 'scripts/audit-print.mjs'
};

/**
 * The project's own command-line scripts, run for the local app (#21).
 *
 * Building a CV or matching an advert from the browser is the same run as `npm run build:pdf` or
 * `npm run audit:ats` from a shell, not a second copy of either, which would be the first to drift. Only
 * the scripts named above run, with an argument list and no shell, so no character in an application's
 * name can become a command.
 */
export class NodeScripts {
  /**
   * @param {string} root - The project root, where every script runs
   * @param {{ timeout?: number }} [options] - How long a run may take, in milliseconds
   */
  constructor(root, { timeout = 10 * 60 * 1000 } = {}) {
    this.root = root;
    this.timeout = timeout;
  }

  /**
   * @param {string} name - One of the scripts above, without its extension
   * @param {string[]} args - Its arguments
   * @returns {Promise<{ exitCode: number|null, signal: string|null, stdout: string, stderr: string }>}
   *   How the run ended, and everything it printed
   */
  run(name, args = []) {
    const script = Object.hasOwn(SCRIPTS, name) ? SCRIPTS[name] : null;
    if (!script) return Promise.reject(new Error(`not a script the local app runs: "${name}"`));
    return new Promise((resolve) => {
      execFile(
        process.execPath,
        [script, ...args],
        { cwd: this.root, timeout: this.timeout, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) =>
          resolve({
            exitCode: error ? (Number.isInteger(error.code) ? error.code : null) : 0,
            signal: error?.signal ?? null,
            stdout,
            stderr
          })
      );
    });
  }
}

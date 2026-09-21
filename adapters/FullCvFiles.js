import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { relative, isAbsolute, join } from 'node:path';
import { Refusal } from '../core/Refusal.js';
import { configFile } from './ConfigDirectory.js';

/**
 * Where the full CV and the letter's defaults are kept: `full-cv/en.json` and `full-cv/letter.json` in the local
 * app's configuration directory, beside the API key and the token (#260, #279). Never inside the project: the full
 * CV holds everything its owner cares to write down, and no commit may carry it.
 * @param {{ env?: object, home?: string, projectRoot?: string }} [where] - The environment, the home directory,
 *   and the project the files must stay out of
 * @returns {{ cv: string, letter: string }} The two files
 * @throws {Error} When either would be inside the project
 */
export function fullCvFiles(where = {}) {
  return {
    cv: configFile('full-cv/en.json', { ...where, what: 'full CV' }),
    // Both files share full-cv/, so a place inside the project is refused on the CV first, and this `what` is only
    // ever read if the two stop sharing a directory.
    letter: configFile('full-cv/letter.json', { ...where, what: "letter defaults' file" })
  };
}

/**
 * The full CV a tailoring starts from, and the defaults every letter takes, as their owner keeps them (#279).
 *
 * Each is read when a job is created, so an edit holds for the next job without a restart. A file that is not there
 * is not an error — the job falls back to the published CV, or to no defaults — but one other users can read is: its
 * owner meant it to be private, and a tailoring must not become the way it stops being so.
 */
export class FullCvFiles {
  /**
   * @param {{ cv: string, letter: string, home?: string }} files - The two files, from `fullCvFiles`, and the home
   *   directory their names are shown under
   */
  constructor({ cv, letter, home = homedir() }) {
    this.cvFile = cv;
    this.letterFile = letter;
    this.home = home;
  }

  /** @returns {Promise<{ cv: object|null, where: string }>} The full CV, or null when there is none, and its file */
  async readCv() {
    return { cv: await this.privateJson(this.cvFile, 'full CV'), where: this.shown(this.cvFile) };
  }

  /** @returns {Promise<{ letter: object|null, where: string }>} The letter's defaults, or null, and their file */
  async readLetter() {
    return {
      letter: await this.privateJson(this.letterFile, "letter's defaults"),
      where: this.shown(this.letterFile)
    };
  }

  /** A file's JSON, when it exists and only its owner can read it. */
  async privateJson(file, what) {
    const where = this.shown(file);
    let info;
    try {
      info = await stat(file);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Refusal(503, `The ${what} at ${where} cannot be read (${error.code}).`);
    }
    if (!info.isFile()) throw new Refusal(503, `The ${what} at ${where} is not a file.`);
    if (info.mode & 0o077) {
      throw new Refusal(
        503,
        `The ${what} at ${where} can be read by other users: set its mode to 600.`
      );
    }
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      throw new Refusal(
        503,
        error instanceof SyntaxError
          ? `The ${what} at ${where} is not valid JSON.`
          : `The ${what} at ${where} cannot be read (${error.code}).`
      );
    }
  }

  /** A file's path as its owner writes it: under `~` when it is in the home directory. */
  shown(file) {
    const inside = relative(this.home, file);
    return inside && !inside.startsWith('..') && !isAbsolute(inside) ? join('~', inside) : file;
  }
}

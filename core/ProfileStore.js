import { DataLoader } from './DataLoader.js';
import { Refusal } from './Refusal.js';

/** The public CV's profile: what the page and every PDF read. */
const GENERAL = 'profiles/general/en.json';

/**
 * The general profile, read and written for the local app (#21) and, later, its editor (#23).
 *
 * The file is the single source of truth for the page and the PDFs, so a write is checked before anything
 * reaches it, and refused with the reason rather than coerced. The check is the one the page applies when
 * it loads a profile — a JSON object with a name or a title — because a profile the page would refuse must
 * not be saved. The full shape the renderers expect is #23's to check.
 *
 * It is written the way the file is kept: two-space JSON and a closing newline, so saving the profile
 * unchanged changes no byte of it.
 */
export class ProfileStore {
  /**
   * @param {{ readText: (path: string) => Promise<string>, writeText: (path: string, text: string) => Promise<void> }} files -
   *   The project's files, by path relative to its root
   */
  constructor(files) {
    this.files = files;
  }

  /** Where the general profile lives, relative to the project. */
  static get path() {
    return GENERAL;
  }

  /** @returns {Promise<object>} The profile as the file holds it */
  async read() {
    return JSON.parse(await this.files.readText(GENERAL));
  }

  /**
   * @param {unknown} profile - The profile to save, as a request sent it
   * @returns {Promise<{ path: string }>} Where it was written
   * @throws {Refusal} 422, with the reason, for a profile the page would refuse to load
   */
  async write(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Refusal(422, 'A profile is a JSON object.');
    }
    if (!new DataLoader().validateCVData(profile)) {
      throw new Refusal(
        422,
        'A profile needs a name or a title: the page refuses to load one with neither.'
      );
    }
    await this.files.writeText(GENERAL, `${JSON.stringify(profile, null, 2)}\n`);
    return { path: GENERAL };
  }
}

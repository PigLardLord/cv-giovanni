import { ProfileShape } from './ProfileShape.js';
import { Refusal } from './Refusal.js';

/** The public CV's profile: what the page and every PDF read. */
const GENERAL = 'profiles/general/en.json';

/**
 * The general profile, read and written for the local app (#21) and, later, its editor (#23).
 *
 * The file is the single source of truth for the page and the PDFs, so a write is checked before anything
 * reaches it, and refused with every problem rather than coerced: against the shape the renderers and the
 * PDF read (`ProfileShape`), which the editor builds its form from (#23).
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
   * @throws {Refusal} 422, with every problem, for a profile without the shape the renderers read
   */
  async write(profile) {
    const problems = ProfileShape.problems(profile);
    if (problems.length) {
      const [first] = problems;
      const more = problems.length > 1 ? `, and ${problems.length - 1} more` : '';
      throw new Refusal(
        422,
        `The profile cannot be saved: ${first.path || 'it'} ${first.reason}${more}.`,
        problems
      );
    }
    await this.files.writeText(GENERAL, `${JSON.stringify(profile, null, 2)}\n`);
    return { path: GENERAL };
  }
}

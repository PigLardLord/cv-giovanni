import { ProfileStore } from './ProfileStore.js';
import { Refusal } from './Refusal.js';

/**
 * A name an application can have. It becomes a directory under `applications/` and a word in every
 * filename generated for it, so: lowercase letters and digits, hyphens inside, at most 40.
 */
export const APPLICATION_NAME = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * The applications on this machine: an advert, and a CV tailored to it (#21).
 *
 * Each lives in `applications/<name>/`, which git ignores, because a CV written for a named employer names
 * that employer and this repository is public. It starts as a copy of the general profile, so matching and
 * building work on the application's own CV and write into its own `out/`, never over `generated/` or the
 * reports in `docs/`. Matching and building run the scripts the command line runs; tailoring is a job of
 * its own, in `Tailorings` (#260).
 */
export class Applications {
  /**
   * @param {object} ports - What the service reaches the machine through
   * @param {{ readText: Function, writeText: Function, exists: Function }} ports.files - The project's files
   * @param {{ run: (name: string, args: string[]) => Promise<object> }} ports.scripts - The project's scripts
   */
  constructor({ files, scripts }) {
    this.files = files;
    this.scripts = scripts;
  }

  /** Where an application's files are, relative to the project. */
  static paths(name) {
    return {
      directory: `applications/${name}`,
      profile: `applications/${name}/en.json`,
      advert: `applications/${name}/advert.txt`
    };
  }

  /**
   * @param {{ name: string, advert: string }} request - The application's name and the advert's text
   * @returns {Promise<{ name: string, profile: string, advert: string }>} What was created, and where
   * @throws {Refusal} 422 for a name or an advert it cannot take, 409 for a name already in use
   */
  async create(request) {
    const { name, advert } =
      request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    if (typeof name !== 'string' || !APPLICATION_NAME.test(name)) {
      throw new Refusal(
        422,
        "An application's name is lowercase letters and digits, with hyphens inside, at most 40 characters: it becomes a directory and a word in every filename."
      );
    }
    if (typeof advert !== 'string' || !advert.trim()) {
      throw new Refusal(422, "An application needs the advert's text.");
    }
    const published =
      JSON.parse(await this.files.readText('config/cv-manifest.json')).profiles || {};
    if (Object.hasOwn(published, name)) {
      throw new Refusal(
        409,
        `"${name}" is a published profile: an application of that name would be ignored, because the published profile wins.`
      );
    }
    const paths = Applications.paths(name);
    if (await this.files.exists(paths.directory)) {
      throw new Refusal(409, `${paths.directory} already exists.`);
    }

    await this.files.writeText(paths.profile, await this.files.readText(ProfileStore.path));
    await this.files.writeText(paths.advert, advert);
    return { name, profile: paths.profile, advert: paths.advert };
  }

  /** Matches the advert against the application's CV: `npm run audit:ats` with both. */
  async match(name) {
    const { profile, advert } = await this.existing(name);
    return this.scripts.run('audit-ats', [`--profile=${profile}`, `--advert=${advert}`]);
  }

  /** Builds the application's CV and letter: `npm run build:pdf` with its profile. */
  async build(name) {
    const { profile } = await this.existing(name);
    return this.scripts.run('generate-pdfs', [`--profile=${profile}`]);
  }

  /**
   * An application's paths, once its name is one an application can have and its advert and CV exist.
   * @throws {Refusal} 404 otherwise
   */
  async existing(name) {
    const missing = new Refusal(404, `No application named ${JSON.stringify(String(name))}.`);
    if (typeof name !== 'string' || !APPLICATION_NAME.test(name)) throw missing;
    const paths = Applications.paths(name);
    const found = await Promise.all([
      this.files.exists(paths.profile),
      this.files.exists(paths.advert)
    ]);
    if (found.includes(false)) throw missing;
    return paths;
  }
}

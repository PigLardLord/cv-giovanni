const DEFAULT_DATA_PATH = 'profiles/general/en.json';
const PUBLISHED_OUT_DIR = 'generated';

/**
 * Which CV is being generated, and where its files go.
 *
 * A CV is `profile × locale × layout`, and the first two are already written in the data
 * path: `<root>/<profile>/<locale>.json`. They are read from there rather than passed
 * alongside it, because two ways of saying the same thing eventually say different things —
 * and the filename would be the one that lies.
 */
export class GenerationTarget {
  constructor({ dataPath, profile, locale, outDir }) {
    this.dataPath = dataPath;
    this.profile = profile;
    this.locale = locale;
    this.outDir = outDir;
  }

  /** `<outDir>/qa` — the twelve variants nobody sends, kept beside the three that ship. */
  get qaDir() {
    return `${this.outDir}/qa`;
  }

  /** What the page reads to know which downloads exist. */
  get manifestPath() {
    return `${this.outDir}/manifest.json`;
  }

  /**
   * True for the CV that ships. An audit of a tailored profile writes its report beside
   * that profile instead of over `docs/`: the committed matrix must describe the published
   * document, not whichever application was audited last.
   */
  get isPublished() {
    return this.dataPath === DEFAULT_DATA_PATH;
  }

  /**
   * Where an audit's markdown belongs.
   * @param {string} name - Report filename, e.g. `PDF_AUDIT.md`
   * @returns {string} Path relative to the project root
   */
  reportPath(name) {
    return this.isPublished ? `docs/${name}` : `${this.outDir}/${name}`;
  }

  /**
   * Read `--profile=<path>` and `--out=<dir>` from an argument list.
   *
   * With no arguments this is the public CV into `generated/`, exactly as before. With a
   * profile and no output directory the files land **beside that profile**, not in
   * `generated/`: that directory is tracked and published, and a CV tailored to a named
   * employer must never arrive there by default. The accident is prevented by the default
   * rather than by remembering.
   * @param {string[]} argv - Arguments after the script name
   * @returns {GenerationTarget} The resolved target
   */
  static fromArguments(argv = []) {
    const options = new Map(argv
      .filter((argument) => argument.startsWith('--'))
      .map((argument) => {
        const separator = argument.indexOf('=');
        return separator < 0
          ? [argument.slice(2), '']
          : [argument.slice(2, separator), argument.slice(separator + 1)];
      }));

    const dataPath = options.get('profile') || DEFAULT_DATA_PATH;
    const match = /^(.*\/)?([^/]+)\/([^/]+)\.json$/.exec(dataPath);
    if (!match) {
      throw new Error(
        `--profile must name a file as <root>/<profile>/<locale>.json, not "${dataPath}" — ` +
          'the profile and the locale are read from the path and end up in every filename.'
      );
    }

    const [, , profile, locale] = match;
    const defaultOut = dataPath === DEFAULT_DATA_PATH
      ? PUBLISHED_OUT_DIR
      : `${dataPath.slice(0, dataPath.lastIndexOf('/'))}/out`;

    return new GenerationTarget({
      dataPath,
      profile,
      locale,
      outDir: (options.get('out') || defaultOut).replace(/\/+$/, '')
    });
  }
}

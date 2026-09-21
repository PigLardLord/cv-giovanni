const DEFAULT_DATA_PATH = 'profiles/general/en.json';
const PUBLISHED_OUT_DIR = 'generated';

/** The options that mean nothing without a value, and what the value is (#258, #272). */
const VALUED = Object.freeze({ profile: '<path>', out: '<path>', advert: '<path>', base: '<ref>' });

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

  /** What the page reads to know which downloads exist. */
  get manifestPath() {
    return `${this.outDir}/manifest.json`;
  }

  /**
   * True for a CV that ships: the public one, or any profile under `profiles/` printed into the directory CI
   * publishes, which is how `published` builds every one the manifest lists (#248). An audit of a tailored
   * profile writes its report beside that profile instead of over `docs/`: the committed matrix must describe
   * the published document, not whichever application was audited last.
   */
  get isPublished() {
    return (
      this.dataPath === DEFAULT_DATA_PATH ||
      (this.outDir === PUBLISHED_OUT_DIR && this.dataPath.startsWith('profiles/'))
    );
  }

  /**
   * Where an audit's markdown belongs. The public CV keeps the names its reports always had; every other
   * published CV names its own after itself, so two of them never write over each other's (#248).
   * @param {string} name - Report filename, e.g. `PRINT_AUDIT.md`
   * @returns {string} Path relative to the project root
   */
  reportPath(name) {
    if (!this.isPublished) return `${this.outDir}/${name}`;
    if (this.dataPath === DEFAULT_DATA_PATH) return `docs/${name}`;
    const dot = name.lastIndexOf('.');
    return `docs/${name.slice(0, dot)}.${this.profile}-${this.locale}${name.slice(dot)}`;
  }

  /**
   * The options a run names, written either way: `--profile=<path>` or `--profile <path>` (#258).
   *
   * The second form used to be read as `--profile` with no value, and a profile with no value fell back to the
   * public CV: "--profile profiles/general/de.json" built the English CV and said nothing. So an option this
   * reads — `--profile`, `--out`, and the audits' `--advert` and `--base` — must carry a value one way or the other,
   * and one that does not is refused rather than defaulted. Anything else is left as it was written, for the script
   * that reads it.
   * @param {string[]} argv - Arguments after the script name
   * @returns {Map<string, string>} Each option's value
   * @throws {Error} For `--profile`, `--out`, `--advert` or `--base` with no value
   */
  static options(argv = []) {
    const options = new Map();
    argv.forEach((argument, at) => {
      if (!argument.startsWith('--')) return;
      const separator = argument.indexOf('=');
      const name = argument.slice(2, separator < 0 ? undefined : separator);
      const next = argv[at + 1];
      const value =
        separator >= 0
          ? argument.slice(separator + 1)
          : next !== undefined && !next.startsWith('--')
            ? next
            : '';
      if (Object.hasOwn(VALUED, name) && !value) {
        const shape = VALUED[name];
        throw new Error(`--${name} needs a value: --${name}=${shape}, or --${name} ${shape}.`);
      }
      options.set(name, value);
    });
    return options;
  }

  /**
   * Every CV the manifest publishes, each printed into the directory CI publishes (#248).
   *
   * Published because the manifest lists it, not because its path matches one written into the code: a
   * second locale listed there was built by nobody and audited by nobody, and its page hid the download. The
   * manifest names each profile and locale twice — as its keys and in the path — and a manifest whose two
   * disagree is refused, since the filename would carry the path's and the page would ask for the keys'.
   * @param {{ profiles?: Record<string, { locales?: Record<string, string> }> }} manifest - `config/cv-manifest.json`
   * @returns {GenerationTarget[]} One target per published profile and locale, in the manifest's order
   */
  static published(manifest) {
    return Object.entries(manifest?.profiles ?? {}).flatMap(([profile, { locales } = {}]) =>
      Object.entries(locales ?? {}).map(([locale, dataPath]) => {
        const target = GenerationTarget.fromArguments([
          `--profile=${dataPath}`,
          `--out=${PUBLISHED_OUT_DIR}`
        ]);
        if (target.profile !== profile || target.locale !== locale) {
          throw new Error(
            `config/cv-manifest.json lists ${dataPath} as ${profile} in ${locale}, and the path says ` +
              `${target.profile} in ${target.locale}: the two must agree.`
          );
        }
        return target;
      })
    );
  }

  /**
   * Read `--profile` and `--out` from an argument list, written either way (see `options`).
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
    const options = GenerationTarget.options(argv);

    // "./profiles/general/de.json" is the same file as "profiles/general/de.json", and read as a different one it
    // walked past every rule that asks whether a path is under profiles/ (the review of #248).
    const dataPath = (options.get('profile') ?? DEFAULT_DATA_PATH).replace(/^(\.\/)+/, '');
    const match = /^(.*\/)?([^/]+)\/([^/]+)\.json$/.exec(dataPath);
    if (!match) {
      throw new Error(
        `--profile must name a file as <root>/<profile>/<locale>.json, not "${dataPath}" — ` +
          'the profile and the locale are read from the path and end up in every filename.'
      );
    }

    const [, , profile, locale] = match;
    const defaultOut =
      dataPath === DEFAULT_DATA_PATH
        ? PUBLISHED_OUT_DIR
        : `${dataPath.slice(0, dataPath.lastIndexOf('/'))}/out`;

    return new GenerationTarget({
      dataPath,
      profile,
      locale,
      outDir: (options.get('out') ?? defaultOut).replace(/\/+$/, '')
    });
  }
}

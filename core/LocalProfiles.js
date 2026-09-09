/**
 * The profiles that exist on this machine but must never exist in the repository.
 *
 * `config/cv-manifest.json` is tracked, so it cannot hold a tailored profile: adding one
 * publishes the company it was written for. The development server therefore merges local
 * profiles into the manifest **as it serves it**, and the file on disk never changes. What
 * is not written cannot be committed by accident.
 */
export class LocalProfiles {
  /**
   * Merge locally discovered profiles into a published manifest.
   *
   * A local profile never replaces a published one. Shadowing `general` from an untracked
   * directory would mean the page and the repository disagree about what the CV says, with
   * nothing on screen to show it — so the published entry wins and the collision is
   * reported to the caller rather than resolved silently.
   * @param {Object} manifest - The manifest as committed
   * @param {Array<{profile: string, locale: string, path: string}>} found - Local profiles
   * @returns {{manifest: Object, added: string[], shadowed: string[]}} A new manifest
   */
  static merge(manifest, found = []) {
    const profiles = { ...(manifest.profiles || {}) };
    const added = [];
    const shadowed = [];

    for (const { profile, locale, path } of found) {
      if (manifest.profiles && manifest.profiles[profile]) {
        shadowed.push(profile);
        continue;
      }
      profiles[profile] = {
        ...(profiles[profile] || {}),
        locales: { ...(profiles[profile]?.locales || {}), [locale]: path }
      };
      if (!added.includes(profile)) added.push(profile);
    }

    return { manifest: { ...manifest, profiles }, added, shadowed };
  }

  /**
   * Read a directory listing into profile entries.
   *
   * Only `<profile>/<locale>.json` counts: `out/` holds generated artefacts, and a stray
   * file at the root of an application is not a CV.
   * @param {Array<{profile: string, files: string[]}>} directories - Application directories
   * @returns {Array<{profile: string, locale: string, path: string}>} Entries
   */
  static entriesFrom(directories = []) {
    return directories.flatMap(({ profile, files }) => files
      .filter((file) => /^[a-z]{2}(-[A-Za-z]{2,4})?\.json$/.test(file))
      .map((file) => ({
        profile,
        locale: file.replace(/\.json$/, ''),
        path: `applications/${profile}/${file}`
      })));
  }
}

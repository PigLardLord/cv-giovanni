import { PROFILE_NAME } from './ProfileName.js';

export class ProfileResolver {
  constructor(manifestUrl = 'config/cv-manifest.json') {
    this.manifestUrl = manifestUrl;
  }

  requestedProfile(search = '') {
    const name = new URLSearchParams(search).get('profile');
    return name && PROFILE_NAME.test(name) ? name : null;
  }

  /**
   * The languages the requested profile, or the default one, is published in. The page takes a guessed
   * language only from these (#103).
   * @param {object|undefined} manifest - `config/cv-manifest.json`
   * @param {string} search - The address's query
   * @returns {string[]} Languages, none for a profile the manifest does not list
   */
  publishedLocales(manifest, search = '') {
    const profileName = this.requestedProfile(search) || manifest?.defaultProfile;
    return Object.keys(manifest?.profiles?.[profileName]?.locales || {});
  }

  async loadManifest() {
    const response = await fetch(this.manifestUrl);
    if (!response.ok) throw new Error(`Unable to load CV manifest (${response.status})`);
    return response.json();
  }

  resolve(manifest, { search = '', locale = 'en' } = {}) {
    const profileName = this.requestedProfile(search) || manifest.defaultProfile;
    const profile = manifest.profiles && manifest.profiles[profileName];
    if (!profile) throw new Error(`Unknown CV profile: ${profileName}`);

    const dataUrl = profile.locales && profile.locales[locale];
    if (!dataUrl) {
      throw new Error(`Profile ${profileName} is not available in ${locale}`);
    }

    return { profile: profileName, locale, dataUrl };
  }

  async resolveRequested(options) {
    return this.resolve(await this.loadManifest(), options);
  }
}

/**
 * The one layout the CV is printed in, and the file every screen layout's Download link offers (#231, #361): the
 * manifest's `pdf`. The owner settled on Technical Profile; Nerd Mode is a screen view that prints nothing of its own.
 * A manifest that names none, or one it does not list, is refused rather than guessed.
 * @param {{ layouts?: string[], pdf?: string }} manifest - `config/cv-manifest.json`
 * @returns {string} The printed layout
 */
export function printedLayout(manifest) {
  const { layouts = [], pdf } = manifest ?? {};
  if (!layouts.includes(pdf)) {
    throw new Error(
      `config/cv-manifest.json prints ${JSON.stringify(pdf ?? null)}, which is not one of its layouts: ${layouts.join(', ')}`
    );
  }
  return pdf;
}

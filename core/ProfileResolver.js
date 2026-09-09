const SAFE_NAME = /^[a-z][a-z0-9-]*$/;

export class ProfileResolver {
  constructor(manifestUrl = 'config/cv-manifest.json') {
    this.manifestUrl = manifestUrl;
  }

  requestedProfile(search = '') {
    const name = new URLSearchParams(search).get('profile');
    return name && SAFE_NAME.test(name) ? name : null;
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

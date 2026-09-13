export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'de'];

/** Resolve locale from URL, saved preference, browser preferences, then fallback. */
export class LocaleResolver {
  constructor({ supported = SUPPORTED_LOCALES, fallback = DEFAULT_LOCALE } = {}) {
    this.supported = supported;
    this.fallback = fallback;
  }

  normalize(value) {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const base = value.trim().toLowerCase().split('-')[0];
    return this.supported.includes(base) ? base : null;
  }

  /**
   * The language to show.
   *
   * One named in the address wins, and is kept even when the profile does not publish it, so asking for a
   * combination nobody publishes fails visibly. A saved preference or a browser's language is a guess: when the
   * profile's languages are known, a guess is taken only from among them, so a CV never refuses to load over a
   * language nobody asked for (#103).
   * @param {object} [options] - Where the language can come from
   * @param {string} [options.search] - The address's query
   * @param {string|null} [options.stored] - A saved preference
   * @param {string[]} [options.browserLanguages] - `navigator.languages`
   * @param {string[]|null} [options.published] - The languages the requested profile is published in
   * @returns {string} A language
   */
  resolve({ search = '', stored = null, browserLanguages = [], published = null } = {}) {
    const requested = this.normalize(new URLSearchParams(search).get('lang'));
    if (requested) return requested;

    const known = Array.isArray(published) && published.length > 0;
    const guess = [stored, ...(browserLanguages || [])]
      .map((candidate) => this.normalize(candidate))
      .find((candidate) => candidate && (!known || published.includes(candidate)));
    if (guess) return guess;

    if (known) return published.includes(this.fallback) ? this.fallback : published[0];
    return this.fallback;
  }
}

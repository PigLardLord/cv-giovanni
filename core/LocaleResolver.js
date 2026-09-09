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

  resolve({ search = '', stored = null, browserLanguages = [] } = {}) {
    const requested = this.normalize(new URLSearchParams(search).get('lang'));
    if (requested) return requested;

    const saved = this.normalize(stored);
    if (saved) return saved;

    for (const candidate of browserLanguages || []) {
      const normalized = this.normalize(candidate);
      if (normalized) return normalized;
    }

    return this.fallback;
  }
}

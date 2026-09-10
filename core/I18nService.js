import i18next from '../vendor/i18next/i18next.js';
import HttpBackend from '../vendor/i18next-http-backend/index.js';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './LocaleResolver.js';

export class I18nService {
  constructor(instance = i18next.createInstance()) {
    this.instance = instance;
  }

  async initialize(locale = DEFAULT_LOCALE) {
    await this.instance.use(HttpBackend).init({
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: SUPPORTED_LOCALES,
      load: 'languageOnly',
      ns: ['ui', 'cv', 'print'],
      defaultNS: 'ui',
      backend: { loadPath: 'locales/{{lng}}/{{ns}}.json?v=20260910-xcode1' },
      interpolation: { escapeValue: false }
    });
    return this;
  }

  t(key, options) {
    return this.instance.t(key, options);
  }

  get language() {
    return this.instance.resolvedLanguage || this.instance.language || DEFAULT_LOCALE;
  }

  async changeLanguage(locale) {
    await this.instance.changeLanguage(locale);
    return this.language;
  }
}

/** Applies i18next messages to the static document shell and its metadata. */
export class DocumentLocalizer {
  constructor(i18n) {
    this.i18n = i18n;
  }

  apply(root, cv = {}) {
    if (!root || !this.i18n) return;

    root.documentElement.lang = this.i18n.language;
    root.title = this.i18n.t('meta.title', { name: cv.identity?.name || '' });

    root.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      const translation = this.i18n.t(key);
      if (translation !== key || !element.textContent.trim()) {
        element.textContent = translation;
      }
    });

    root.querySelectorAll('[data-i18n-attr]').forEach((element) => {
      element.dataset.i18nAttr.split(',').forEach((mapping) => {
        const [attribute, key] = mapping.split(':').map((part) => part.trim());
        if (attribute && key) {
          element.setAttribute(attribute, this.i18n.t(key, { name: cv.identity?.name || '' }));
        }
      });
    });
  }
}

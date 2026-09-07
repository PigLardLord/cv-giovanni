/** Applies i18next messages to the static document shell and its metadata. */
export class DocumentLocalizer {
  constructor(i18n) {
    this.i18n = i18n;
  }

  apply(root, data = {}) {
    if (!root || !this.i18n) return;

    root.documentElement.lang = this.i18n.language;
    root.title = this.i18n.t('meta.title', { name: data.name || '' });

    root.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = this.i18n.t(element.dataset.i18n);
    });

    root.querySelectorAll('[data-i18n-attr]').forEach((element) => {
      element.dataset.i18nAttr.split(',').forEach((mapping) => {
        const [attribute, key] = mapping.split(':').map((part) => part.trim());
        if (attribute && key) {
          element.setAttribute(attribute, this.i18n.t(key, { name: data.name || '' }));
        }
      });
    });
  }
}

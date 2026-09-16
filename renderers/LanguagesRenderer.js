import { BaseRenderer } from './BaseRenderer.js';

export class LanguagesRenderer extends BaseRenderer {
  render(root, data) {
    const container = this.getElement(root, 'languages');
    if (!container) return;

    const languages = this.validate(data) ? data.languages.filter(Boolean) : [];
    this.setSectionVisibility(container, languages.length > 0);
    if (languages.length === 0) return;

    this.renderItems(container, languages, (language) => this.createLanguageItem(root, language));
  }

  createLanguageItem(root, language) {
    // The name and the level are text (#157).
    return this.appendPieces(root, this.createElement(root, 'li'), [
      this.createElement(root, 'strong', '', `${language.name ?? ''}:`),
      ` ${language.level ?? ''}`
    ]);
  }

  validate(data) {
    return this.validateFields(data, ['languages']) && Array.isArray(data.languages);
  }
}

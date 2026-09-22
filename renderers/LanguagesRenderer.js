import { BaseRenderer } from './BaseRenderer.js';
import { holdSeparators } from './inlineSeparator.js';

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
    // The name and the level are text (#157), and a separator in the level stays with its words (#180).
    return this.appendPieces(root, this.createElement(root, 'li'), [
      this.createElement(root, 'span', 'language-name', `${language.name ?? ''}:`),
      ...holdSeparators(root, ` ${language.level ?? ''}`)
    ]);
  }

  validate(data) {
    return this.validateFields(data, ['languages']) && Array.isArray(data.languages);
  }
}

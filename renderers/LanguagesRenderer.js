import { BaseRenderer } from './BaseRenderer.js';

export class LanguagesRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'languages');
    if (!container) return;

    this.renderItems(container, data.languages, (language) => 
      this.createLanguageItem(root, language)
    );
  }

  createLanguageItem(root, language) {
    return this.createElement(root, 'li', '', `
      <strong>${language.name}:</strong> ${language.level}
    `);
  }

  validate(data) {
    return this.validateFields(data, ['languages']) && 
           Array.isArray(data.languages);
  }
}
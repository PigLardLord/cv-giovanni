import { BaseRenderer } from './BaseRenderer.js';

export class EducationRenderer extends BaseRenderer {
  render(root, data) {
    const container = this.getElement(root, 'education');
    if (!container) return;

    const education = this.validate(data) ? data.education.filter(Boolean) : [];
    this.setSectionVisibility(container, education.length > 0);
    if (education.length === 0) return;

    this.renderItems(container, education, (edu) => this.createEducationEntry(root, edu));
  }

  createEducationEntry(root, edu) {
    const description = typeof edu.description === 'string' ? edu.description.trim() : '';

    // Every string from the data is text (#157).
    return this.appendPieces(root, this.createElement(root, 'div', 'edu-entry'), [
      this.createElement(root, 'div', 'edu-degree', String(edu.degree ?? '')),
      this.appendPieces(root, this.createElement(root, 'div'), [
        this.createElement(root, 'span', 'edu-school', String(edu.school ?? '')),
        ' ',
        this.createElement(root, 'span', 'edu-period', `(${edu.period ?? ''})`)
      ]),
      description ? this.createElement(root, 'p', 'edu-description', description) : null
    ]);
  }

  validate(data) {
    return this.validateFields(data, ['education']) && Array.isArray(data.education);
  }
}

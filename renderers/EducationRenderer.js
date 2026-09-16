import { BaseRenderer } from './BaseRenderer.js';
import { schoolLine } from '../domain/EntryLines.js';

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

    // Every string from the data is text (#157), and a degree with no period writes no brackets (#169).
    return this.appendPieces(root, this.createElement(root, 'div', 'edu-entry'), [
      this.createElement(root, 'div', 'edu-degree', String(edu.degree ?? '')),
      this.appendPieces(
        root,
        this.createElement(root, 'div'),
        this.fieldPieces(root, schoolLine(edu), { school: 'edu-school', period: 'edu-period' })
      ),
      description ? this.createElement(root, 'p', 'edu-description', description) : null
    ]);
  }

  validate(data) {
    return this.validateFields(data, ['education']) && Array.isArray(data.education);
  }
}

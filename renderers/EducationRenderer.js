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

    return this.createElement(
      root,
      'div',
      'edu-entry',
      `
      <div class="edu-degree">${edu.degree}</div>
      <div>
        <span class="edu-school">${edu.school}</span>
        <span class="edu-period">(${edu.period})</span>
      </div>
      ${description ? `<p class="edu-description">${description}</p>` : ''}
    `
    );
  }

  validate(data) {
    return this.validateFields(data, ['education']) && Array.isArray(data.education);
  }
}

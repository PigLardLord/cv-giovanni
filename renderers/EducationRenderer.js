import { BaseRenderer } from './BaseRenderer.js';

export class EducationRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'education');
    if (!container) return;

    this.renderItems(container, data.education, (edu) => 
      this.createEducationEntry(root, edu)
    );
  }

  createEducationEntry(root, edu) {
    return this.createElement(root, 'div', 'edu-entry', `
      <div class="edu-degree">${edu.degree}</div>
      <div>
        <span class="edu-school">${edu.school}</span> 
        <span class="edu-period">(${edu.period})</span>
      </div>
      <p class="edu-description">${edu.description}</p>
    `);
  }

  validate(data) {
    return this.validateFields(data, ['education']) && 
           Array.isArray(data.education);
  }
}
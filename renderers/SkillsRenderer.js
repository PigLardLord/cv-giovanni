import { BaseRenderer } from './BaseRenderer.js';

export class SkillsRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'skills');
    if (!container) return;

    this.renderItems(container, data.skills, (skill) => 
      this.createSkillItem(root, skill)
    );
  }

  createSkillItem(root, skill) {
    const total = 5;
    const filled = '●'.repeat(skill.level);
    const empty = '○'.repeat(total - skill.level);

    return this.createElement(root, 'li', '', `
      <span class="skill-name">${skill.name}</span>
      <span class="skill-level">${filled}${empty}</span>
    `);
  }

  validate(data) {
    return this.validateFields(data, ['skills']) && 
           Array.isArray(data.skills);
  }
}
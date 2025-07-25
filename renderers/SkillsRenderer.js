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
    const badge = this.createElement(root, 'div', 'skill-badge');
    
    const skillName = this.createElement(root, 'span', 'skill-name');
    skillName.textContent = skill.name;
    
    const skillLevel = this.createElement(root, 'div', 'skill-level');
    
    // Create skill dots
    for (let i = 1; i <= 5; i++) {
      const dot = this.createElement(root, 'div', 'skill-dot');
      if (i > skill.level) {
        dot.classList.add('empty');
      }
      skillLevel.appendChild(dot);
    }
    
    badge.appendChild(skillName);
    badge.appendChild(skillLevel);
    
    return badge;
  }

  validate(data) {
    return this.validateFields(data, ['skills']) && 
           Array.isArray(data.skills);
  }
}
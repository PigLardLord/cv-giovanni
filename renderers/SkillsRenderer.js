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
    
    const skillLevel = this.createElement(root, 'span', 'skill-level');
    
    // Create skill level using bullet characters
    let levelText = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= skill.level) {
        levelText += '●'; // Filled bullet
      } else {
        levelText += '○'; // Empty bullet
      }
      if (i < 5) levelText += ' '; // Add space between bullets
    }
    skillLevel.textContent = levelText;
    
    badge.appendChild(skillName);
    badge.appendChild(skillLevel);
    
    return badge;
  }

  validate(data) {
    return this.validateFields(data, ['skills']) && 
           Array.isArray(data.skills);
  }
}
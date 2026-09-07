import { BaseRenderer } from './BaseRenderer.js';

export class SkillsRenderer extends BaseRenderer {
  constructor(i18n = null) {
    super();
    this.i18n = i18n;
  }

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
    skillLevel.setAttribute('aria-label', this.i18n
      ? this.i18n.t('skills.level', { ns: 'cv', level: skill.level, maximum: 5 })
      : `${skill.level} out of 5`);
    
    badge.appendChild(skillName);
    badge.appendChild(skillLevel);
    
    return badge;
  }

  validate(data) {
    return this.validateFields(data, ['skills']) && 
           Array.isArray(data.skills);
  }
}

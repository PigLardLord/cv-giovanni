import { BaseRenderer } from './BaseRenderer.js';

export class SkillsRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'skills');
    if (!container) return;

    this.renderItems(container, this.toGroups(data.skills), (group) =>
      this.createSkillGroup(root, group)
    );
  }

  toGroups(skills) {
    const grouped = skills.some((entry) => entry && Array.isArray(entry.items));
    if (grouped) {
      return skills.filter((entry) => entry && Array.isArray(entry.items)).map((entry) => ({
        category: entry.category || '',
        names: entry.items.map((item) => item && item.name).filter(Boolean)
      })).filter((group) => group.names.length > 0);
    }

    return [{
      category: '',
      names: skills.map((skill) => skill && skill.name).filter(Boolean)
    }];
  }

  createSkillGroup(root, group) {
    const element = this.createElement(root, 'div', 'skill-group');
    if (group.category) {
      const category = this.createElement(root, 'strong', 'skill-category');
      category.textContent = group.category;
      element.appendChild(category);
    }

    const names = this.createElement(root, 'span', 'skill-list');
    this.appendNamed(root, names, group.names, 'skill');
    element.appendChild(names);
    return element;
  }

  validate(data) {
    return this.validateFields(data, ['skills']) && 
           Array.isArray(data.skills);
  }
}

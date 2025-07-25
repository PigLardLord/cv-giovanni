import { BaseRenderer } from './BaseRenderer.js';

export class InterestsRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'interests');
    if (!container) return;

    this.renderItems(container, data.interests, (interest) => 
      this.createInterestTag(root, interest)
    );
  }

  createInterestTag(root, interest) {
    const tag = this.createElement(root, 'span', 'tag');
    tag.textContent = interest;
    return tag;
  }

  validate(data) {
    return this.validateFields(data, ['interests']) && 
           Array.isArray(data.interests);
  }
}
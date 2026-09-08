import { BaseRenderer } from './BaseRenderer.js';

export class InterestsRenderer extends BaseRenderer {
  render(root, data) {
    const container = this.getElement(root, 'interests');
    if (!container) return;

    const interests = this.validate(data) ? this.toInterests(data.interests) : [];
    this.setSectionVisibility(container, interests.length > 0);
    if (interests.length === 0) return;

    const line = this.createElement(root, 'span', 'interests-line');
    this.appendNamed(root, line, interests, 'interest');
    container.appendChild(line);
  }

  /**
   * Reduce the raw entries to the ones worth printing.
   * @param {Array} interests - Raw interest entries
   * @returns {string[]} Trimmed, non-empty interests
   */
  toInterests(interests) {
    return interests.map((interest) => String(interest).trim()).filter(Boolean);
  }

  validate(data) {
    return this.validateFields(data, ['interests']) &&
           Array.isArray(data.interests);
  }
}

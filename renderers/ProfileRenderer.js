import { BaseRenderer } from './BaseRenderer.js';

export class ProfileRenderer extends BaseRenderer {
  render(root, data) {
    const profileElement = this.getElement(root, 'profile');
    if (!profileElement) return;

    const summary = this.validate(data) && typeof data.profile === 'string'
      ? data.profile.trim()
      : '';

    this.setSectionVisibility(profileElement, summary !== '');
    profileElement.textContent = summary;
  }

  validate(data) {
    return this.validateFields(data, ['profile']);
  }
}
import { BaseRenderer } from './BaseRenderer.js';

export class ProfileRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const profileElement = this.getElement(root, 'profile');
    if (profileElement) {
      profileElement.textContent = data.profile || '';
    }
  }

  validate(data) {
    return this.validateFields(data, ['profile']);
  }
}
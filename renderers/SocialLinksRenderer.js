import { BaseRenderer } from './BaseRenderer.js';

export class SocialLinksRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.querySelector(root, '.social-links');
    if (!container) return;

    this.renderItems(container, data.social, (link) => 
      this.createSocialLink(root, link)
    );
  }

  createSocialLink(root, link) {
    return this.createLink(root, link.url, link.platform);
  }

  validate(data) {
    return this.validateFields(data, ['social']) && 
           Array.isArray(data.social);
  }
}
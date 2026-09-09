import { BaseRenderer } from './BaseRenderer.js';
import { readableAddress } from '../domain/ReadableUrl.js';

export class SocialLinksRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.querySelector(root, '.social-links');
    if (!container) return;

    const anchors = data.social
      .filter((link) => !!link)
      .map((link) => this.createSocialLink(root, link));

    this.appendSeparated(root, container, anchors);
  }

  createSocialLink(root, link) {
    const anchor = this.createLink(root, link.url, this.toVisibleText(link));
    anchor.setAttribute('title', link.platform || '');
    return anchor;
  }

  /**
   * On paper a link is only useful if the reader can retype it, so show the
   * readable address and keep the platform name as the accessible label.
   * @param {Object} link - Social entry with `platform` and `url`
   * @returns {string} Text to display
   */
  toVisibleText(link) {
    return readableAddress(link.url, link.platform || '');
  }

  validate(data) {
    return this.validateFields(data, ['social']) &&
           Array.isArray(data.social);
  }
}

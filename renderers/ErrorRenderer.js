import { BaseRenderer } from './BaseRenderer.js';

/**
 * The failure state, rendered where the CV would have been.
 *
 * It lived in `CVApplication` as a template string with inline styles, which put a piece of the
 * interface inside the layer that decides when things happen. The application now says the CV
 * could not be built and hands over the words; what that looks like is decided here and in the
 * stylesheet, like every other section.
 */
export class ErrorRenderer extends BaseRenderer {
  /**
   * @param {Document} root - DOM document to render into
   * @param {{title: string, message: string, hint: string}} failure - already localised
   */
  render(root, { title = '', message = '', hint = '' } = {}) {
    const panel = this.createElement(root, 'div', 'cv-error');
    panel.appendChild(this.createElement(root, 'h2', 'cv-error__title', title));
    panel.appendChild(this.createElement(root, 'p', 'cv-error__message', message));
    panel.appendChild(this.createElement(root, 'p', 'cv-error__hint', hint));
    root.body.replaceChildren(panel);
  }
}

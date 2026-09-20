import { Renderer } from '../interfaces/Renderer.js';
import { holdSeparators } from './inlineSeparator.js';

export class HeaderRenderer extends Renderer {
  constructor(i18n = null) {
    super();
    this.i18n = i18n;
  }

  render(root, data) {
    if (!this.validate(data)) return;
    const { identity } = data;

    const nameElement = root.getElementById('name');
    const titleElement = root.getElementById('title');
    const subtitleElement = root.getElementById('subtitle');
    const availabilityElement = root.getElementById('availability');
    const authorisationElement = root.getElementById('work-authorisation');
    const locationElement = root.getElementById('location');
    const contactsElement = root.getElementById('contacts');

    if (nameElement) nameElement.textContent = identity.name || '';
    if (titleElement) titleElement.textContent = identity.title || '';
    this.renderOptional(subtitleElement, identity.subtitle);
    this.renderOptional(availabilityElement, identity.availability);
    this.renderOptional(authorisationElement, identity.workAuthorisation);
    if (locationElement) locationElement.textContent = identity.location || '';

    if (contactsElement) {
      const email = this.i18n ? this.i18n.t('contacts.email', { ns: 'cv' }) : 'Email';
      const phone = this.i18n ? this.i18n.t('contacts.phone', { ns: 'cv' }) : 'Phone';
      // Labels and values are text, never markup (#157).
      const line = (label, value) => {
        const strong = root.createElement('strong');
        strong.textContent = `${label}:`;
        return [strong, root.createTextNode(` ${value || ''}`)];
      };
      contactsElement.replaceChildren(
        ...line(email, identity.email),
        root.createElement('br'),
        // The break the markup wrote after the line: collapsed on the page, a word boundary in the text.
        root.createTextNode('\n'),
        ...line(phone, identity.phone)
      );
    }
  }

  renderOptional(element, value) {
    if (!element) return;
    const text = typeof value === 'string' ? value.trim() : '';
    // A separator stays with the words either side of it: a wrap left "Enterprise Mobility ·" ending a line (#180).
    element.replaceChildren(...holdSeparators(element.ownerDocument, text));
    element.hidden = text === '';
  }

  validate(data) {
    return (
      super.validate(data) &&
      !!(data.identity?.name || data.identity?.title || data.identity?.email)
    );
  }
}

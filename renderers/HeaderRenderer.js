import { Renderer } from '../interfaces/Renderer.js';

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
    const locationElement = root.getElementById('location');
    const contactsElement = root.getElementById('contacts');

    if (nameElement) nameElement.textContent = identity.name || '';
    if (titleElement) titleElement.textContent = identity.title || '';
    this.renderOptional(subtitleElement, identity.subtitle);
    this.renderOptional(availabilityElement, identity.availability);
    if (locationElement) locationElement.textContent = identity.location || '';

    if (contactsElement) {
      const email = this.i18n ? this.i18n.t('contacts.email', { ns: 'cv' }) : 'Email';
      const phone = this.i18n ? this.i18n.t('contacts.phone', { ns: 'cv' }) : 'Phone';
      contactsElement.innerHTML = `
        <strong>${email}:</strong> ${identity.email || ''}<br>
        <strong>${phone}:</strong> ${identity.phone || ''}
      `;
    }
  }

  renderOptional(element, value) {
    if (!element) return;
    const text = typeof value === 'string' ? value.trim() : '';
    element.textContent = text;
    element.hidden = text === '';
  }

  validate(data) {
    return (
      super.validate(data) &&
      !!(data.identity?.name || data.identity?.title || data.identity?.email)
    );
  }
}

import { Renderer } from '../interfaces/Renderer.js';

export class HeaderRenderer extends Renderer {
  constructor(i18n = null) {
    super();
    this.i18n = i18n;
  }

  render(root, data) {
    if (!this.validate(data)) return;

    const nameElement = root.getElementById('name');
    const titleElement = root.getElementById('title');
    const subtitleElement = root.getElementById('subtitle');
    const availabilityElement = root.getElementById('availability');
    const locationElement = root.getElementById('location');
    const contactsElement = root.getElementById('contacts');

    if (nameElement) nameElement.textContent = data.name || '';
    if (titleElement) titleElement.textContent = data.title || '';
    this.renderOptional(subtitleElement, data.subtitle);
    this.renderOptional(availabilityElement, data.availability);
    if (locationElement) locationElement.textContent = data.location || '';
    
    if (contactsElement) {
      const email = this.i18n ? this.i18n.t('contacts.email', { ns: 'cv' }) : 'Email';
      const phone = this.i18n ? this.i18n.t('contacts.phone', { ns: 'cv' }) : 'Phone';
      contactsElement.innerHTML = `
        <strong>${email}:</strong> ${data.email || ''}<br>
        <strong>${phone}:</strong> ${data.phone || ''}
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
    return super.validate(data) && !!(data.name || data.title || data.email);
  }
}

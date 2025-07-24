import { Renderer } from '../interfaces/Renderer.js';

export class HeaderRenderer extends Renderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const nameElement = root.getElementById('name');
    const titleElement = root.getElementById('title');
    const locationElement = root.getElementById('location');
    const contactsElement = root.getElementById('contacts');

    if (nameElement) nameElement.textContent = data.name || '';
    if (titleElement) titleElement.textContent = data.title || '';
    if (locationElement) locationElement.textContent = data.location || '';
    
    if (contactsElement) {
      contactsElement.innerHTML = `
        <strong>Email:</strong> ${data.email || ''}<br>
        <strong>Phone:</strong> ${data.phone || ''}
      `;
    }
  }

  validate(data) {
    return super.validate(data) && !!(data.name || data.title || data.email);
  }
}
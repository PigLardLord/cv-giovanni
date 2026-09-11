import { BaseRenderer } from './BaseRenderer.js';

export class CertificationsRenderer extends BaseRenderer {
  render(root, data) {
    const container = this.getElement(root, 'certifications');
    if (!container) return;

    const certifications = this.validate(data) ? data.certifications.filter(Boolean) : [];
    this.setSectionVisibility(container, certifications.length > 0);
    if (certifications.length === 0) return;

    this.renderItems(container, certifications, (cert) => this.createCertificationItem(root, cert));
  }

  createCertificationItem(root, cert) {
    const li = this.createElement(root, 'li');

    let content = '';
    if (cert.url) {
      const link = this.createLink(root, cert.url, cert.name);
      link.innerHTML = `<strong>${cert.name}</strong>`;
      content = link.outerHTML;
    } else {
      content = `<strong>${cert.name}</strong>`;
    }

    content += ` – ${cert.issuer} (${cert.year})`;

    const description = typeof cert.description === 'string' ? cert.description.trim() : '';
    if (description) {
      content += `<span class="cert-description">${description}</span>`;
    }

    li.innerHTML = content;

    const prose = li.querySelector('.cert-description');
    if (prose) this.setProse(root, prose, prose.textContent);

    return li;
  }

  validate(data) {
    return this.validateFields(data, ['certifications']) && Array.isArray(data.certifications);
  }
}

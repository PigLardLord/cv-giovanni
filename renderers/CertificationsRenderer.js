import { BaseRenderer } from './BaseRenderer.js';

export class CertificationsRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'certifications');
    if (!container) return;

    this.renderItems(container, data.certifications, (cert) => 
      this.createCertificationItem(root, cert)
    );
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
    
    if (cert.description) {
      content += `<span class="cert-description">${cert.description}</span>`;
    }
    
    li.innerHTML = content;
    return li;
  }

  validate(data) {
    return this.validateFields(data, ['certifications']) && 
           Array.isArray(data.certifications);
  }
}
import { BaseRenderer } from './BaseRenderer.js';
import { certificationLine } from '../domain/EntryLines.js';
import { holdSeparators } from './inlineSeparator.js';

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
    // Every string from the data is text (#157); the name is a link to the certificate when there is one, and the
    // issuer and the year each bring their own separator only when the certification has them (#169), held to the
    // words either side of it (#180).
    const name = this.createElement(root, 'strong', '', String(cert.name ?? ''));
    const title = cert.url ? this.createLink(root, cert.url, '') : null;
    if (title) title.appendChild(name);

    const description = typeof cert.description === 'string' ? cert.description.trim() : '';
    return this.appendPieces(root, this.createElement(root, 'li'), [
      title || name,
      ...holdSeparators(root, certificationLine(cert).join('')),
      description
        ? this.setProse(root, this.createElement(root, 'span', 'cert-description'), description)
        : null
    ]);
  }

  validate(data) {
    return this.validateFields(data, ['certifications']) && Array.isArray(data.certifications);
  }
}

import { BaseRenderer } from './BaseRenderer.js';

export class ExperienceRenderer extends BaseRenderer {
  constructor(i18n = null) {
    super();
    this.i18n = i18n;
  }

  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'experience');
    if (!container) return;

    this.renderItems(container, data.experience, (job) => this.createJobEntry(root, job));
  }

  createJobEntry(root, job) {
    const at = this.i18n ? this.i18n.t('experience.at', { ns: 'cv' }) : 'at';
    const entry = this.createElement(
      root,
      'div',
      'job-entry',
      `
      <div class="job-header">
        <span class="job-title">${job.title}</span> ${at}
        <span class="job-company">${job.company}</span>, ${job.location}
      </div>
      <div class="job-period">${job.period}</div>
      ${job.summary ? `<p class="job-summary">${job.summary}</p>` : ''}
      ${job.description ? `<p class="job-description">${job.description}</p>` : ''}
    `
    );

    ['.job-summary', '.job-description'].forEach((selector) => {
      const prose = entry.querySelector(selector);
      if (prose) this.setProse(root, prose, prose.textContent);
    });

    if (Array.isArray(job.highlights) && job.highlights.length > 0) {
      const list = this.createElement(root, 'ul', 'job-highlights');
      job.highlights.forEach((highlight) => {
        list.appendChild(this.setProse(root, this.createElement(root, 'li'), highlight));
      });
      entry.appendChild(list);
    }

    return entry;
  }

  validate(data) {
    return this.validateFields(data, ['experience']) && Array.isArray(data.experience);
  }
}

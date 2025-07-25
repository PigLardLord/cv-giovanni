import { BaseRenderer } from './BaseRenderer.js';

export class ExperienceRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'experience');
    if (!container) return;

    this.renderItems(container, data.relevant_experience, (job) => 
      this.createJobEntry(root, job)
    );
  }

  createJobEntry(root, job) {
    return this.createElement(root, 'div', 'job-entry', `
      <div class="job-header">
        <span class="job-title">${job.title}</span> at 
        <span class="job-company">${job.company}</span>, ${job.location}
      </div>
      <div class="job-period">${job.period}</div>
      <p class="job-description">${job.description}</p>
    `);
  }

  validate(data) {
    return this.validateFields(data, ['relevant_experience']) && 
           Array.isArray(data.relevant_experience);
  }
}
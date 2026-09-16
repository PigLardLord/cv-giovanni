import { BaseRenderer } from './BaseRenderer.js';
import { tenureText } from '../domain/Tenure.js';
import { roleHeader } from '../domain/EntryLines.js';

export class ExperienceRenderer extends BaseRenderer {
  constructor(i18n = null) {
    super();
    this.i18n = i18n;
  }

  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.getElement(root, 'experience');
    if (!container) return;

    const locale = this.i18n?.language || 'en';
    this.renderItems(container, data.experience, (job) =>
      this.createJobEntry(root, job, tenureText(data.monthsIn(job), locale))
    );
  }

  createJobEntry(root, job, tenure = '') {
    const at = this.i18n ? this.i18n.t('experience.at', { ns: 'cv' }) : 'at';
    const entry = this.createElement(root, 'div', 'job-entry');

    // Every string from the data is text (#157), and the header reads "Title at Company, City", without the comma when
    // the role names no city (#169).
    entry.appendChild(
      this.appendPieces(
        root,
        this.createElement(root, 'div', 'job-header'),
        this.fieldPieces(root, roleHeader(job, at), { title: 'job-title', company: 'job-company' })
      )
    );
    entry.appendChild(
      this.appendPieces(root, this.createElement(root, 'div', 'job-period'), [
        String(job.period ?? ''),
        ...(tenure
          ? [
              ' ',
              this.appendPieces(root, this.createElement(root, 'span', 'job-tenure'), [
                '(',
                ...this.wholeUnits(root, tenure),
                ')'
              ])
            ]
          : [])
      ])
    );
    [
      ['job-summary', job.summary],
      ['job-description', job.description]
    ].forEach(([className, prose]) => {
      if (prose)
        entry.appendChild(this.setProse(root, this.createElement(root, 'p', className), prose));
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

  /**
   * A length with each number held to its unit: "8 years" and "2 months" never break inside, so a line too
   * narrow for the whole length breaks after the comma (#55).
   * @param {Document} root - DOM root
   * @param {string} tenure - The length as Intl writes it
   * @returns {(string|Element)[]} The length's pieces: text, and a `no-break` span for each number and its unit
   */
  wholeUnits(root, tenure) {
    return tenure
      .split(/(\d+\s+\p{L}+)/u)
      .map((piece, index) =>
        index % 2 === 1
          ? this.createElement(root, 'span', 'no-break', piece.replace(/\s+/u, ' '))
          : piece
      );
  }

  validate(data) {
    return this.validateFields(data, ['experience']) && Array.isArray(data.experience);
  }
}

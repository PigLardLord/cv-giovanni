import { BaseRenderer } from './BaseRenderer.js';
import { schoolLine } from '../domain/EntryLines.js';

export class EducationRenderer extends BaseRenderer {
  constructor(i18n = null) {
    super();
    this.i18n = i18n;
  }

  render(root, data) {
    const container = this.getElement(root, 'education');
    if (!container) return;

    const education = this.validate(data) ? data.education.filter(Boolean) : [];
    this.setSectionVisibility(container, education.length > 0);
    if (education.length === 0) return;

    this.renderItems(container, education, (edu) => this.createEducationEntry(root, edu));
  }

  createEducationEntry(root, edu) {
    const description = typeof edu.description === 'string' ? edu.description.trim() : '';

    // Every string from the data is text (#157), a degree with no period writes no brackets (#169), and one that
    // states its credits writes them after the period, a count held to its unit (#48).
    return this.appendPieces(root, this.createElement(root, 'div', 'edu-entry'), [
      this.createElement(root, 'div', 'edu-degree', String(edu.degree ?? '')),
      this.appendPieces(
        root,
        this.createElement(root, 'div'),
        this.fieldPieces(root, schoolLine(edu, { credits: (count) => this.creditsText(count) }), {
          school: 'edu-school',
          period: 'edu-period',
          credits: 'edu-credits no-break'
        })
      ),
      description ? this.createElement(root, 'p', 'edu-description', description) : null
    ]);
  }

  /**
   * A count of credits in the CV's words: the catalogue writes the unit, `Intl` the number.
   * @param {number} count - The degree's credits
   * @returns {string} The count and its unit, "60 ECTS"
   */
  creditsText(count) {
    const number = new Intl.NumberFormat(this.i18n?.language || 'en').format(count);
    return this.i18n
      ? this.i18n.t('education.credits', { ns: 'cv', count: number })
      : `${number} ECTS`;
  }

  validate(data) {
    return this.validateFields(data, ['education']) && Array.isArray(data.education);
  }
}

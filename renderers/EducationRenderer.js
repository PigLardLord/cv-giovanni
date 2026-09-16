import { BaseRenderer } from './BaseRenderer.js';
import { degreeLine, schoolLine } from '../domain/EntryLines.js';

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
    // states its credits writes them after its name, held to their unit (#48).
    return this.appendPieces(root, this.createElement(root, 'div', 'edu-entry'), [
      this.appendPieces(
        root,
        this.createElement(root, 'div', 'edu-degree'),
        this.fieldPieces(root, degreeLine(edu, this.creditWords()), {
          credits: 'edu-credits no-break'
        })
      ),
      this.appendPieces(
        root,
        this.createElement(root, 'div'),
        this.fieldPieces(root, schoolLine(edu), { school: 'edu-school', period: 'edu-period' })
      ),
      description ? this.createElement(root, 'p', 'edu-description', description) : null
    ]);
  }

  /**
   * How the CV writes a count of credits: the catalogue's words, in the CV's language, whose `Intl` writes the number.
   * @returns {{ credits: (count: string) => string, locale: string }} The words, as `degreeLine` takes them
   */
  creditWords() {
    return {
      locale: this.i18n?.language || 'en',
      credits: (count) =>
        this.i18n ? this.i18n.t('education.credits', { ns: 'cv', count }) : `${count} ECTS`
    };
  }

  validate(data) {
    return this.validateFields(data, ['education']) && Array.isArray(data.education);
  }
}

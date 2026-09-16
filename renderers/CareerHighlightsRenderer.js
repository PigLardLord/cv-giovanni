import { BaseRenderer } from './BaseRenderer.js';

/**
 * The profile's career highlights, under "Selected Impact": its summary of evidence, which only the
 * pdfmake PDF used to show (#148). A highlight is written into its item as text, never as markup: the
 * profile is typed into an editor and tailored by a model, and "<0.1%" must reach the page as written
 * (#157).
 */
export class CareerHighlightsRenderer extends BaseRenderer {
  render(root, data) {
    const container = this.getElement(root, 'career-highlights');
    if (!container) return;

    const highlights = this.validate(data) ? this.toHighlights(data.careerHighlights) : [];
    container.textContent = '';
    this.setSectionVisibility(container, highlights.length > 0);

    // As text, with each hyphenated compound held together the way a role's achievements are (setProse).
    highlights.forEach((highlight) => {
      container.appendChild(this.setProse(root, this.createElement(root, 'li'), highlight));
    });
  }

  /**
   * Reduce the raw entries to the ones worth showing.
   * @param {Array} highlights - The model's career highlights
   * @returns {string[]} Trimmed, non-empty highlights, in the profile's order
   */
  toHighlights(highlights) {
    return highlights.map((highlight) => String(highlight ?? '').trim()).filter(Boolean);
  }

  validate(data) {
    return this.validateFields(data, ['careerHighlights']) && Array.isArray(data.careerHighlights);
  }
}

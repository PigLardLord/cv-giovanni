import { BaseRenderer } from './BaseRenderer.js';
import { figurePieces } from '../domain/Figures.js';

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

    // As text, with each hyphenated compound held together the way a role's achievements are (setProse), and each
    // figure in Bold, whole — #230 set them so, and the page had left them in the body's weight (#261). What a figure
    // is, is the domain's rule, not the renderer's guess.
    highlights.forEach((highlight) => {
      const item = this.createElement(root, 'li');
      figurePieces(highlight).forEach(({ text, figure }) => {
        if (figure)
          item.appendChild(this.createElement(root, 'span', 'impact-figure no-break', text));
        else this.appendProse(root, item, text);
      });
      container.appendChild(item);
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

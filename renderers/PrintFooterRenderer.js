import { BaseRenderer } from './BaseRenderer.js';
import { joinSeparated } from './inlineSeparator.js';

/**
 * Renders one restrained footer per printed page.
 *
 * Chromium does not support `@page` margin boxes, so each footer is an element
 * the stylesheet anchors to the bottom of its page via the `--page-index` it is
 * tagged with. The count used to be a literal, which meant a short profile got
 * a footer anchored past the end of its content — and that footer, alone on a
 * sheet of its own, *created* the blank second page it then numbered. It is now
 * set from the measured layout.
 */
export class PrintFooterRenderer extends BaseRenderer {
  constructor(pageCount = 1, i18n = null) {
    super();
    this.pageCount = this.toPageCount(pageCount);
    this.i18n = i18n;
  }

  /**
   * Adopt a freshly measured page count.
   * @param {number} pageCount - Pages the content actually paginates to
   */
  setPageCount(pageCount) {
    this.pageCount = this.toPageCount(pageCount);
  }

  /** A page count is a positive integer; anything else means one page. */
  toPageCount(value) {
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  }

  render(root, data) {
    if (!this.validate(data)) return;

    const container = this.querySelector(root, '.page-footers');
    if (!container) return;

    for (let page = 1; page <= this.pageCount; page += 1) {
      const footer = this.createElement(root, 'div', 'page-footer');
      footer.style.setProperty('--page-index', String(page - 1));
      const documentKind = this.i18n
        ? this.i18n.t('documentKind', { ns: 'print' })
        : 'CV';
      const label = this.i18n
        ? this.i18n.t('footer', {
          ns: 'print', data, name: data.name, documentKind,
          page, pageCount: this.pageCount
        })
        : joinSeparated([data.name, documentKind, `${page}/${this.pageCount}`]);
      footer.textContent = joinSeparated(label.split(' · '));
      container.appendChild(footer);
    }
  }

  validate(data) {
    return this.validateFields(data, ['name']) &&
           typeof data.name === 'string' &&
           data.name.trim() !== '';
  }
}

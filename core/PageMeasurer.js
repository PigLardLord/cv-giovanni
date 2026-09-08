import { PAGE_CONTENT_HEIGHT_MM } from './PageGeometry.js';

/** A4 width minus the 21mm horizontal margins declared by `@page`. */
export const PAGE_CONTENT_WIDTH_MM = 168;

const MM_PER_CSS_PX = 25.4 / 96;

/**
 * Measures the printed layout while the page is still on screen.
 *
 * Chromium runs no script against its own print fragmentation, and inside
 * `beforeprint` the document is still laid out for the screen — measured:
 * 708.6mm on screen against 531.8mm in print, for the same content. So the
 * print layout is reproduced deliberately: `print.css` is promoted to
 * `media="all"` and the body is clamped to the A4 content box, measured, then
 * put back. That reproduction was checked against Chromium's own print
 * layout and agreed to the last hundredth of a millimetre.
 *
 * Everything here only reads geometry. What the numbers *mean* is decided by
 * `PageGeometry`, which needs no DOM at all.
 */
export class PageMeasurer {
  constructor(root = typeof document !== 'undefined' ? document : null,
              { pageHeightMm = PAGE_CONTENT_HEIGHT_MM,
                contentWidthMm = PAGE_CONTENT_WIDTH_MM } = {}) {
    this.root = root;
    this.pageHeightMm = pageHeightMm;
    this.contentWidthMm = contentWidthMm;
  }

  /** @returns {boolean} True when there is a live layout to measure */
  canMeasure() {
    return !!(this.root && this.root.body &&
              typeof this.root.body.getBoundingClientRect === 'function');
  }

  /**
   * Run `measure` with the print stylesheet applied, then restore the page.
   *
   * The footers are hidden for the duration. They are absolutely positioned at
   * `page-index × 267mm`, so they stretch `scrollHeight` to whatever page count
   * they were last rendered for — measuring with them in place makes any count
   * confirm itself, and a one-page CV keeps the blank second sheet its own
   * footer created.
   *
   * The restore runs in a `finally`: a throw inside the callback must not leave
   * the reader looking at a page clamped to 168mm with no footers.
   *
   * @param {() => T} measure - Callback run against the print layout
   * @returns {T|null} Whatever the callback returned, or null if unmeasurable
   * @template T
   */
  withPrintLayout(measure) {
    if (!this.canMeasure()) return null;

    const sheets = this.printStylesheets();
    const previousMedia = sheets.map((sheet) => sheet.media);
    const body = this.root.body;
    const previousWidth = body.style.width;
    const footers = this.root.querySelector
      ? this.root.querySelector('.page-footers')
      : null;
    const previousDisplay = footers
      ? footers.style.getPropertyValue('display')
      : null;
    const previousPriority = footers
      ? footers.style.getPropertyPriority('display')
      : '';

    try {
      sheets.forEach((sheet) => { sheet.media = 'all'; });
      // `print.css` declares `display: block !important` on this container, so
      // the override has to carry `important` too — without it the footers stay
      // laid out and the measurement comes back as whatever page count they
      // were already anchored for.
      if (footers) footers.style.setProperty('display', 'none', 'important');
      body.style.width = `${this.contentWidthMm}mm`;
      body.getBoundingClientRect(); // force layout before reading
      return measure();
    } finally {
      sheets.forEach((sheet, index) => { sheet.media = previousMedia[index]; });
      if (footers) {
        footers.style.removeProperty('display');
        if (previousDisplay) {
          footers.style.setProperty('display', previousDisplay, previousPriority);
        }
      }
      body.style.width = previousWidth;
    }
  }

  /** @returns {Element[]} The stylesheets that only apply when printing */
  printStylesheets() {
    if (!this.root.querySelectorAll) return [];
    return Array.from(this.root.querySelectorAll('link[rel="stylesheet"]'))
      .filter((link) => (link.media || '').includes('print'));
  }

  /**
   * Height of the whole printed flow, in millimetres.
   * @returns {number} Measured height, or 0 when it cannot be measured
   */
  documentHeightMm() {
    const height = this.withPrintLayout(() =>
      this.toMm(this.root.body.scrollHeight));
    return height === null ? 0 : height;
  }

  /**
   * Position and size of each element matching `selector`, in document order.
   * @param {string} selector - CSS selector for the blocks to measure
   * @returns {Array<{element: Element, topMm: number, heightMm: number}>} Blocks
   */
  measureBlocks(selector) {
    const blocks = this.withPrintLayout(() => {
      const elements = Array.from(this.root.querySelectorAll(selector));
      const scrollY = typeof window !== 'undefined' ? (window.scrollY || 0) : 0;
      return elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          topMm: this.toMm(rect.top + scrollY),
          heightMm: this.toMm(rect.height)
        };
      });
    });
    return blocks === null ? [] : blocks;
  }

  toMm(px) {
    return Number.isFinite(px) ? px * MM_PER_CSS_PX : 0;
  }
}

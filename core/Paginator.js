import { PageMeasurer } from './PageMeasurer.js';
import { pageCountFor, cutIndexFor, PAGE_CONTENT_HEIGHT_MM } from './PageGeometry.js';

/**
 * Decides the two things `print.css` cannot express, from measurements rather
 * than from constants written by hand.
 *
 * Chromium has no `@page` margin boxes and no way to repeat a block's header
 * when it fragments, so both the per-page footers and the "(continued)" cue are
 * ordinary elements someone has to place. Until now that someone was a human
 * reading a rendered PDF: the page count and the cut index were literals in
 * `script.js`, correct only for the copy they were measured against. A profile
 * with twelve jobs printed five pages under footers that still said "1/2", a
 * short one printed a blank second sheet that existed only to carry its own
 * footer, and renaming the employer in the data made the cue disappear.
 *
 * Everything the CSS can do — `break-inside`, `orphans`, `widows`, the
 * `break-after` chain that welds a heading to its first bullet — is left to the
 * CSS, which already handles arbitrary content correctly.
 */
export class Paginator {
  constructor({ measurer = new PageMeasurer(),
                pageHeightMm = PAGE_CONTENT_HEIGHT_MM,
                onLayout = null } = {}) {
    this.measurer = measurer;
    this.pageHeightMm = pageHeightMm;
    this.onLayout = onLayout;
  }

  /**
   * Measure the rendered document and report what it actually paginates to.
   *
   * @returns {{pageCount: number, heightMm: number, cuts: Map<Element, number>}}
   */
  measure() {
    const heightMm = this.measurer.documentHeightMm();
    const pageCount = pageCountFor(heightMm, this.pageHeightMm);

    return { pageCount, heightMm, cuts: this.measureCuts() };
  }

  /**
   * For each job entry, which of its highlights first lands on a later page.
   *
   * Entries are keyed by their position among *all* job entries, not by the
   * element. Two reasons, and both were live bugs:
   *
   * - Applying a cut re-renders the section, so every measured element is
   *   detached by the time the marker looks itself up. A `Map` keyed by element
   *   comes back holding nothing but orphans and the cue never appears.
   * - Counting only the entries that carry bullets shifts every index after an
   *   entry that has none (a short internship with a summary and no highlights
   *   is enough), so the cut lands on the wrong job.
   *
   * @returns {Map<number, number>} Entry position to cut index
   */
  measureCuts() {
    const cuts = new Map();
    if (!this.measurer.canMeasure()) return cuts;

    const entries = this.measurer.measureBlocks('.job-entry')
      .map((block) => block.element);
    const bullets = this.measurer.measureBlocks('.job-entry .job-highlights li');
    const byEntry = new Map();

    for (const bullet of bullets) {
      const entry = this.closestEntry(bullet.element);
      const position = entries.indexOf(entry);
      if (position < 0) continue;
      if (!byEntry.has(position)) byEntry.set(position, []);
      byEntry.get(position).push(bullet);
    }

    for (const [position, blocks] of byEntry) {
      const cut = cutIndexFor(blocks, this.pageHeightMm);
      if (cut !== null) cuts.set(position, cut);
    }

    return cuts;
  }

  closestEntry(element) {
    return element && typeof element.closest === 'function'
      ? element.closest('.job-entry')
      : null;
  }

  /**
   * Measure, then hand the result to whoever re-renders from it.
   * @returns {Object|null} The layout that was applied
   */
  apply() {
    if (!this.measurer.canMeasure()) return null;

    const layout = this.measure();
    if (this.onLayout) this.onLayout(layout);
    return layout;
  }
}

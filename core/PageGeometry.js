/**
 * Pagination arithmetic, kept free of the DOM so it can be reasoned about and
 * tested without a browser.
 *
 * Nothing here is measured — the caller supplies measurements. That split is
 * the point: the numbers that used to be written by hand in `script.js`
 * (`PrintFooterRenderer(2)`, `beforeHighlight: 5`) are now *derived* from
 * whatever the content turns out to be.
 */

/** A4 minus the 15mm vertical margins declared by `@page` in print.css. */
export const PAGE_CONTENT_HEIGHT_MM = 267;

/**
 * How many pages a flow of the given height occupies.
 *
 * A flow shorter than one page is still one page, and a flow that ends exactly
 * on a boundary does not open an empty one — the case that made a one-page CV
 * print with a stray second sheet carrying nothing but its footer.
 *
 * @param {number} contentHeightMm - Measured height of the printed flow
 * @param {number} [pageHeightMm] - Usable height of one page
 * @returns {number} Page count, never below 1
 */
export function pageCountFor(contentHeightMm, pageHeightMm = PAGE_CONTENT_HEIGHT_MM) {
  if (!Number.isFinite(contentHeightMm) || contentHeightMm <= 0) return 1;
  if (!Number.isFinite(pageHeightMm) || pageHeightMm <= 0) return 1;

  // A hair of tolerance: sub-millimetre overshoot is rounding in the measure,
  // not a page's worth of content.
  const pages = Math.ceil((contentHeightMm - 0.5) / pageHeightMm);
  return Math.max(1, pages);
}

/**
 * Which page a block sits on, counting from 1.
 * @param {number} topMm - Distance from the top of the flow
 * @param {number} [pageHeightMm] - Usable height of one page
 * @returns {number} 1-based page index
 */
export function pageOf(topMm, pageHeightMm = PAGE_CONTENT_HEIGHT_MM) {
  if (!Number.isFinite(topMm) || topMm < 0) return 1;
  return Math.floor(topMm / pageHeightMm) + 1;
}

/**
 * The first block in a run that lands on a later page than the run's first.
 *
 * This is what replaces the hand-counted `beforeHighlight`: the cut is read off
 * the measurements rather than declared, so it stays right when the copy
 * changes, and reports nothing when the run does not actually straddle a break.
 *
 * @param {Array<{topMm: number, heightMm: number}>} blocks - Measured blocks, in order
 * @param {number} [pageHeightMm] - Usable height of one page
 * @returns {number|null} Index of the first block on the next page, or null
 */
export function cutIndexFor(blocks, pageHeightMm = PAGE_CONTENT_HEIGHT_MM) {
  if (!Array.isArray(blocks) || blocks.length < 2) return null;

  const firstPage = pageOf(blocks[0].topMm, pageHeightMm);

  for (let index = 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block || !Number.isFinite(block.topMm)) continue;
    if (pageOf(block.topMm, pageHeightMm) > firstPage) return index;
  }

  return null;
}

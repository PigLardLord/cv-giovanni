import {
  pageCountFor,
  pageOf,
  cutIndexFor,
  PAGE_CONTENT_HEIGHT_MM
} from '../core/PageGeometry.js';

describe('PageGeometry.pageCountFor', () => {
  test('a flow shorter than a page is one page', () => {
    expect(pageCountFor(120)).toBe(1);
  });

  test('a flow that ends exactly on the boundary does not open an empty page', () => {
    // The bug this guards: a one-page CV printed a second sheet carrying
    // nothing but the footer that had been hard-coded into existence.
    expect(pageCountFor(PAGE_CONTENT_HEIGHT_MM)).toBe(1);
  });

  test('a millimetre past the boundary is two pages', () => {
    expect(pageCountFor(PAGE_CONTENT_HEIGHT_MM + 1)).toBe(2);
  });

  test('the measured height of the real CV gives two pages', () => {
    expect(pageCountFor(531.8)).toBe(2);
  });

  test('a long profile is not capped at two', () => {
    expect(pageCountFor(531.8 * 2.5)).toBe(5);
  });

  test('missing or absurd measurements fall back to a single page', () => {
    expect(pageCountFor(0)).toBe(1);
    expect(pageCountFor(-40)).toBe(1);
    expect(pageCountFor(NaN)).toBe(1);
    expect(pageCountFor(undefined)).toBe(1);
    expect(pageCountFor(400, 0)).toBe(1);
  });
});

describe('PageGeometry.pageOf', () => {
  test('the top of the flow is page one', () => {
    expect(pageOf(0)).toBe(1);
  });

  test('just under the boundary is still page one', () => {
    expect(pageOf(PAGE_CONTENT_HEIGHT_MM - 0.1)).toBe(1);
  });

  test('the boundary itself opens page two', () => {
    expect(pageOf(PAGE_CONTENT_HEIGHT_MM)).toBe(2);
  });
});

describe('PageGeometry.cutIndexFor', () => {
  const block = (topMm, heightMm = 10) => ({ topMm, heightMm });

  test('reports nothing when every block sits on one page', () => {
    expect(cutIndexFor([block(10), block(30), block(50)])).toBeNull();
  });

  test('finds the first block that lands on the next page', () => {
    const blocks = [block(200), block(230), block(280), block(310)];
    expect(cutIndexFor(blocks)).toBe(2);
  });

  test('a run of one block cannot be cut', () => {
    expect(cutIndexFor([block(260)])).toBeNull();
  });

  test('index zero is never returned — that would move the entry, not continue it', () => {
    // Even when the run starts on page two, the cut is relative to its own
    // first block, so the marker can never head an empty continuation.
    const blocks = [block(300), block(320), block(360)];
    expect(cutIndexFor(blocks)).toBeNull();
  });

  test('survives holes in the measurements', () => {
    const blocks = [block(200), { topMm: NaN, heightMm: 10 }, block(280)];
    expect(cutIndexFor(blocks)).toBe(2);
  });

  test('is not given by a hard-coded company name', () => {
    // The regression that made the "(continued)" cue vanish when the employer
    // was renamed in the data: nothing here reads a company at all.
    const blocks = [block(240), block(270)];
    expect(cutIndexFor(blocks)).toBe(1);
  });
});

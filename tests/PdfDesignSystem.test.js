import { PdfDesignSystem } from '../adapters/PdfDesignSystem.js';

const theme = { ink: '#111', body: '#222', muted: '#333', signal: '#444' };

test('keeps font choice outside the PDF composer', () => {
  const design = new PdfDesignSystem({ fontFamily: 'Test Sans' }).resolve(theme);
  expect(design.defaultStyle.font).toBe('Test Sans');
  expect(design.styles.section.color).toBe('#111');
});

test('takes every colour from the theme, so a monochrome theme yields a monochrome scale', () => {
  const design = new PdfDesignSystem().resolve(theme);
  const used = [
    design.defaultStyle.color,
    ...Object.values(design.styles).map((style) => style.color)
  ];
  expect(new Set(used)).toEqual(new Set(Object.values(theme)));
});

test('sets no level below the 9pt print floor', () => {
  const design = new PdfDesignSystem().resolve(theme);
  const sizes = [
    design.defaultStyle.fontSize,
    ...Object.values(design.styles).map((s) => s.fontSize)
  ];
  expect(sizes.filter((size) => size < 9)).toEqual([]);
});

test('separates its levels by more than a rounding error', () => {
  // The old scale ran 9 to 12pt and called it hierarchy. A heading one point above the body is
  // noise; these steps have to be visible at arm's length.
  const design = new PdfDesignSystem().resolve(theme);
  const sizes = [...new Set(Object.values(design.styles).map((s) => s.fontSize))].sort(
    (a, b) => a - b
  );
  expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThanOrEqual(3);
});

test('tracks letters loosely enough to look designed and tightly enough to extract', () => {
  // At 1pt of tracking on 9.5pt type, pdftotext reads the gaps as spaces and "Professional
  // Experience" extracts as "P ro fe s s i o n a l  E x p e r i e n c e" — invisible on the
  // page, and the required-text check fails on a string nobody changed. 0.6 was measured as
  // the point it recovers; this keeps margin below it.
  const design = new PdfDesignSystem().resolve(theme);
  const tracked = Object.values(design.styles)
    .map((style) => style.characterSpacing)
    .filter((value) => value !== undefined);
  expect(tracked.length).toBeGreaterThan(0);
  expect(Math.max(...tracked)).toBeLessThanOrEqual(0.5);
});

import { PdfDesignSystem } from '../adapters/PdfDesignSystem.js';

test('keeps font choice outside the PDF composer', () => {
  const design = new PdfDesignSystem({ fontFamily: 'Test Sans' }).resolve({ primary: '#111', accent: '#222' });
  expect(design.defaultStyle.font).toBe('Test Sans');
  expect(design.styles.section.color).toBe('#111');
});

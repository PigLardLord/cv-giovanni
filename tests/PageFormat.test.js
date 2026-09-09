import { PageFormat } from '../domain/PageFormat.js';

test.each(['A4', 'LETTER'])('supports %s', (format) => {
  expect(new PageFormat().resolve(format).name).toBe(format);
});

test('rejects unknown page formats', () => {
  expect(() => new PageFormat().resolve('LEGAL')).toThrow('Unsupported page format');
});

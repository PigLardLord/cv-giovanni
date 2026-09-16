/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { lineBox } from '../scripts/lib/font-metrics.mjs';

// pdfmake sets a line as tall as its font's line box times the line height, and pdftotext measured Inter's glyph boxes
// at 9.3pt as 11.2526pt (tests/fixtures/room-left). The PDF audit counts the room a page has left in that line (#124).
describe("a font's line box", () => {
  test('of the vendored Inter is what pdftotext measured at 9.3pt', () => {
    const inter = readFileSync(new URL('../vendor/fonts/inter/Inter-Regular.ttf', import.meta.url));
    expect(lineBox(inter) * 9.3).toBeCloseTo(11.2526, 3);
  });

  test('is refused for a file that is not a font', () => {
    expect(() => lineBox(new Uint8Array(64))).toThrow(/head and hhea/);
  });
});

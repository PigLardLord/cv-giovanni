/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The page asked `PdfExporter` for four naming rules, and that module imports pdfmake's composer, so
// every visit downloaded the PDF layout, its design system and its theme registry to name a file
// (#145). The page's module graph is read from its own import statements, as the browser follows them.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSER = [
  'adapters/PdfLayout.js',
  'adapters/PdfDesignSystem.js',
  'adapters/LayoutThemeRegistry.js'
];

function moduleGraph(entry) {
  const seen = new Set();
  const visit = (file) => {
    const path = relative(root, file);
    if (seen.has(path)) return;
    seen.add(path);
    const source = readFileSync(file, 'utf8');
    const specifiers = [
      ...source.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/gm),
      ...source.matchAll(/^\s*import\s*['"](\.[^'"]+)['"]/gm),
      ...source.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)
    ].map((match) => match[1]);
    for (const specifier of specifiers) visit(join(dirname(file), specifier));
  };
  visit(join(root, entry));
  return [...seen];
}

describe("the page's module graph", () => {
  test('reaches the renderers the page uses, so an empty graph cannot pass', () => {
    const graph = moduleGraph('script.js');

    expect(graph).toContain('renderers/HeaderRenderer.js');
    expect(graph).toContain('renderers/downloadLinks.js');
  });

  test("loads none of pdfmake's composer to name the file it offers", () => {
    expect(moduleGraph('script.js').filter((path) => COMPOSER.includes(path))).toEqual([]);
  });
});

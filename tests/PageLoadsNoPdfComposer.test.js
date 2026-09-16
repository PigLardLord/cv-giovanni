/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { posix } from 'node:path';
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
const fromDisk = (path) => readFileSync(join(root, path), 'utf8');

/**
 * Every module the browser loads from an entry point, as paths from the repository root.
 * @param {string} entry - The entry module's path from the root
 * @param {(path: string) => string} read - A module's source by its path
 * @returns {string[]} The modules reached, the entry first
 */
function moduleGraph(entry, read = fromDisk) {
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    // A comment is not code: JSDoc writes `{import('./X.js').X}` for a type, and a browser loads nothing for it.
    // Only comments that own their lines are dropped, as every comment here does; a "/*" inside a string on a
    // line of code does not open one, so the imports after it survive.
    const source = read(path)
      .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    const specifiers = [
      ...source.matchAll(/^\s*(?:import|export)\s[^'"`]*?from\s*(['"])(\.[^'"]+)\1/gm),
      ...source.matchAll(/^\s*import\s*(['"])(\.[^'"]+)\1/gm),
      // A dynamic import's specifier may be a template literal, as long as nothing is interpolated into it.
      ...source.matchAll(/import\(\s*(['"`])(\.[^'"`$]+)\1\s*\)/g)
    ].map((match) => match[2]);
    for (const specifier of specifiers) visit(posix.join(posix.dirname(path), specifier));
  };
  visit(entry);
  return [...seen];
}

describe('reading a module graph', () => {
  // The code review of #145: a dynamic import written with backticks went unseen, and a JSDoc type import
  // would have been followed as if the browser loaded it.
  const sources = {
    'entry.js': [
      'import {',
      '  A',
      "} from './sub/a.js';",
      "export * from './b.js';",
      "import './c.js';",
      'const d = await import(`./d.js`);',
      "const e = await import('./e.js');",
      "/** @param {import('./typed.js').Typed} value */"
    ].join('\n'),
    'sub/a.js': "import { F } from '../up/f.js';",
    'b.js': '',
    'c.js': '',
    'd.js': '',
    'e.js': '',
    'up/f.js': ''
  };
  const read = (path) => {
    if (!(path in sources)) throw new Error(`no module ${path}`);
    return sources[path];
  };

  // The review of that fix: stripping every `/* … */` span cut from a string's "/*" to the next comment's end,
  // imports included; and a `//` comment that mentions an import was followed.
  test('keeps an import that follows a string holding "/*", and skips one a line comment mentions', () => {
    const tricky = {
      'entry.js': [
        'const help = "see /* for details";',
        "import './real.js';",
        '/** end */',
        "// once loaded with import('./old.js'), now unused"
      ].join('\n'),
      'real.js': ''
    };

    expect(moduleGraph('entry.js', (path) => tricky[path]).sort()).toEqual(['entry.js', 'real.js']);
  });

  test('follows every import form the browser follows, through parent directories', () => {
    expect(moduleGraph('entry.js', read).sort()).toEqual(
      ['b.js', 'c.js', 'd.js', 'e.js', 'entry.js', 'sub/a.js', 'up/f.js'].sort()
    );
  });
});

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

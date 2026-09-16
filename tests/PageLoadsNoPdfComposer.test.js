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
 * A module's source with its comments blanked out, their line breaks kept.
 *
 * A comment is not code: JSDoc writes `{import('./X.js').X}` for a type, and a browser loads nothing for it.
 * Patterns over the raw text kept getting this wrong, in the reviews of #145: a string holding "/*", a
 * comment closing mid-line, a `//` comment naming an import. So the source is read the way the language
 * reads it, character by character, through strings, template literals, regular expressions and comments.
 * A `/` opens a regular expression where an operand is expected, after the condition of an `if` included,
 * which is the usual reading and holds for every module this test reaches; a template literal nesting another inside `${}` is not followed.
 * @param {string} source - A module's source
 * @returns {string} The same source, every comment character a space
 */
function withoutComments(source) {
  let out = '';
  let state = 'code';
  let quote = '';
  let last = '';
  // For each open parenthesis, whether it holds the condition of `if`, `while`, `for`, `with` or `catch`:
  // after its `)` an operand is expected, so a `/` there opens a regular expression.
  const conditions = [];
  for (let at = 0; at < source.length; at += 1) {
    const char = source[at];
    const next = source[at + 1];
    const blank = char === '\n' ? '\n' : ' ';
    if (state === 'line') {
      if (char === '\n') state = 'code';
      out += blank;
    } else if (state === 'block') {
      if (char === '*' && next === '/') {
        out += '  ';
        at += 1;
        state = 'code';
      } else out += blank;
    } else if (state === 'string' || state === 'pattern' || state === 'class') {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        at += 1;
      } else if (state === 'string' && char === quote) state = 'code';
      else if (state === 'pattern' && char === '[') state = 'class';
      else if (state === 'class' && char === ']') state = 'pattern';
      else if (state === 'pattern' && char === '/') state = 'code';
      if (state === 'code') last = char;
    } else if (char === '/' && next === '/') {
      state = 'line';
      out += ' ';
    } else if (char === '/' && next === '*') {
      state = 'block';
      out += '  ';
      at += 1;
    } else if (char === '"' || char === "'" || char === '`') {
      state = 'string';
      quote = char;
      out += char;
    } else if (
      char === '/' &&
      (last === '' ||
        /[(,=:[!&|?{};+\-*%<>~^]/.test(last) ||
        /\b(?:return|typeof|case|in|of|void|yield|await)$/.test(out.trimEnd()))
    ) {
      state = 'pattern';
      out += char;
    } else {
      if (char === '(') conditions.push(/\b(?:if|while|for|with|catch)\s*$/.test(out));
      out += char;
      if (char === ')' && conditions.pop()) last = ';';
      else if (!/\s/.test(char)) last = char;
    }
  }
  return out;
}

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
    const source = withoutComments(read(path));
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

  // The review of the second fix: a comment closing mid-line let the pattern run on to a later comment's end,
  // swallowing the import between; a JSDoc type on a line of code was still followed; and a regular expression
  // holding a quote or "/*" is code, not the start of a string or a comment.
  test('keeps imports beside comments that close mid-line and after a regular expression, and skips inline JSDoc', () => {
    const tricky = {
      'entry.js': [
        '/* first',
        "   still first */ import './real.js';",
        '/* second',
        '   still second */',
        "import './also-real.js';",
        "/** @type {import('./typed.js').Typed} */ const y = 5;",
        'const pattern = /["\'/*]/g;',
        "import './after-pattern.js';"
      ].join('\n'),
      'real.js': '',
      'also-real.js': '',
      'after-pattern.js': ''
    };
    const read = (path) => {
      if (!(path in tricky)) throw new Error(`no module ${path}`);
      return tricky[path];
    };

    expect(moduleGraph('entry.js', read).sort()).toEqual(
      ['after-pattern.js', 'also-real.js', 'entry.js', 'real.js'].sort()
    );
  });

  // The review of the scanner: after the `)` of `if (x)`, a `/` opens a regular expression, not a division;
  // read as a division, `/a\/*/` opened a comment that ran to the end of the file and hid the import below.
  test('reads a regular expression after the condition of a braceless if', () => {
    const tricky = {
      'entry.js': [
        "import './top.js';",
        'function check(x) {',
        '  if (x) /a\\/*/.test(x);',
        '  return total / 2;',
        '}',
        "export const later = () => import('./dynamic-target.js');"
      ].join('\n'),
      'top.js': '',
      'dynamic-target.js': ''
    };

    expect(moduleGraph('entry.js', (path) => tricky[path]).sort()).toEqual(
      ['dynamic-target.js', 'entry.js', 'top.js'].sort()
    );
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

/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importClosure, importSpecifiers } from '../scripts/lib/import-closure.mjs';

// Which modules the ATS parser reaches, read from its imports rather than listed by hand (#181). A list kept by hand
// is the list nobody updates the day the parser imports a new lexicon, and a change to that lexicon would then change
// the grader without anything noticing.
const root = fileURLToPath(new URL('..', import.meta.url));
const fromDisk = (path) =>
  existsSync(`${root}${path}`) ? readFileSync(`${root}${path}`, 'utf8') : null;

describe('the modules a source imports', () => {
  test('reads static, multi-line, re-exported, bare and dynamic imports', () => {
    const source = [
      "import { a } from './a.js';",
      'import {',
      '  b,',
      '  c',
      "} from '../b.js';",
      "import './side-effect.js';",
      "export { d } from './d.js';",
      'export * from "./e.js";',
      "const f = await import('./f.js');",
      "import { readFile } from 'node:fs/promises';",
      "import i18next from 'i18next';"
    ].join('\n');

    expect(importSpecifiers(source)).toEqual([
      './a.js',
      '../b.js',
      './side-effect.js',
      './d.js',
      './e.js',
      './f.js',
      'node:fs/promises',
      'i18next'
    ]);
  });

  test('a word "from" in prose is not an import', () => {
    expect(importSpecifiers("// the text from './nowhere.js' is a comment\nconst x = 1;")).toEqual(
      []
    );
  });
});

describe('the closure of a module', () => {
  const files = {
    'core/Parser.js': "import { A } from '../domain/A.js';\nimport { readFile } from 'node:fs';",
    'domain/A.js': "import { fold } from './fold.js';\nimport { B } from './B.js';",
    'domain/B.js': "import { A } from './A.js';",
    'domain/fold.js': 'export const fold = (x) => x;',
    'domain/Unused.js': 'export const unused = 1;'
  };
  const read = (path) => files[path] ?? null;

  test('follows relative imports transitively, through a cycle, and leaves packages out', () => {
    expect(importClosure(['core/Parser.js'], read)).toEqual([
      'core/Parser.js',
      'domain/A.js',
      'domain/B.js',
      'domain/fold.js'
    ]);
  });

  test('names a module that is imported but cannot be read, so a missing file is not silently dropped', () => {
    const missing = (path) => (path === 'domain/B.js' ? null : read(path));

    expect(importClosure(['core/Parser.js'], missing)).toContain('domain/B.js');
  });

  test('starts from several modules at once', () => {
    expect(importClosure(['domain/B.js', 'domain/Unused.js'], read)).toEqual([
      'domain/A.js',
      'domain/B.js',
      'domain/Unused.js',
      'domain/fold.js'
    ]);
  });

  test("the ATS parser's closure is the parser and the domain modules it reads", () => {
    expect(importClosure(['core/AtsTextParser.js'], fromDisk)).toEqual([
      'core/AtsTextParser.js',
      'domain/DateRange.js',
      'domain/PlaceLexicon.js',
      'domain/RecoveredCv.js',
      'domain/SectionLexicon.js',
      'domain/fold.js'
    ]);
  });
});

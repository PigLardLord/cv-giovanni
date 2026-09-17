/**
 * @jest-environment node
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { CvDocument } from '../domain/CvDocument.js';
import { degreeLine } from '../domain/EntryLines.js';
import { importApart, importClosure, importSpecifiers } from '../scripts/lib/import-closure.mjs';

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

// The base branch's parser and grader are imported beside this branch's own (#181, #201). Node's loader caches a module
// by its URL, so a copy written elsewhere is a module of its own: the base's `EntryLines` can never answer the head's
// `RecoveryDiff`, or the head's the base's.
describe('modules imported apart from this checkout', () => {
  let scratch;
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'import-apart-'));
  });
  afterEach(() => rmSync(scratch, { recursive: true, force: true }));

  const DEGREE = 'text: valueOf(degree.degree) }';
  const reworded = (path) =>
    path === 'domain/EntryLines.js'
      ? fromDisk(path).replace(DEGREE, 'text: `${valueOf(degree.degree)}, reworded` }')
      : fromDisk(path);

  test('each copy imports the copies beside it, and grades by its own lines', async () => {
    const [copy, lines] = await importApart(
      ['core/RecoveryDiff.js', 'domain/EntryLines.js'],
      reworded,
      join(scratch, 'modules')
    );
    // The print as it is: its second degree, "B.Sc. Computer Engineering", states no scope and reads back exactly.
    const document = new CvDocument(JSON.parse(fromDisk('profiles/general/en.json')));
    const recovered = AtsTextParser.parse(fromDisk('tests/fixtures/ats/page-print-nerd.txt'));

    expect(fromDisk('domain/EntryLines.js')).toContain(DEGREE);
    expect(lines.degreeLine({ degree: 'B.Sc.' })).toEqual([
      { field: 'degree', text: 'B.Sc., reworded' }
    ]);
    expect(degreeLine({ degree: 'B.Sc.' })).toEqual([{ field: 'degree', text: 'B.Sc.' }]);
    expect(copy.RecoveryDiff).not.toBe(RecoveryDiff);
    expect(copy.RecoveryDiff.diff(document, recovered).education[1].degree).toBe('partial');
    expect(RecoveryDiff.diff(document, recovered).education[1].degree).toBe('exact');
  });

  test('writes the closure and nothing else, as ES modules', async () => {
    const directory = join(scratch, 'modules');
    await importApart(['core/RecoveryDiff.js'], fromDisk, directory);

    expect(readdirSync(directory, { recursive: true }).sort()).toEqual([
      'core',
      'core/RecoveryDiff.js',
      'domain',
      'domain/EntryLines.js',
      'domain/ReadableUrl.js',
      'domain/fold.js',
      'package.json'
    ]);
    expect(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))).toEqual({
      type: 'module'
    });
  });

  test('a module the closure cannot read is named, and nothing is imported from anywhere else', async () => {
    const missing = (path) => (path === 'domain/fold.js' ? null : fromDisk(path));
    const directory = join(scratch, 'modules');

    await expect(importApart(['core/RecoveryDiff.js'], missing, directory)).rejects.toThrow(
      'cannot read domain/fold.js'
    );
    expect(existsSync(directory)).toBe(false);
  });
});

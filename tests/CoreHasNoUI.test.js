import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core');
const modules = fs.readdirSync(core).filter((name) => name.endsWith('.js'));

// What a core module may not contain. The application layer decides WHAT the document says and
// WHEN it is produced; how it looks belongs to an adapter or a renderer. Left mixed, a change of
// typeface reaches into the same file as a change of orchestration, and neither can be reviewed
// on its own.
const forbidden = [
  { name: 'markup', pattern: /innerHTML|<div\b|<h\d\b|<p>|style="/ },
  { name: 'typography or geometry', pattern: /\bfontSize\b|\blineHeight\b|\bpageMargins\b|\bcolumnGap\b|\bmargin:\s*\[|\bpadding:/ },
  { name: 'colour literal', pattern: /#[0-9a-fA-F]{6}\b/ }
];

describe('the core carries no user interface', () => {
  test.each(modules)('core/%s', (name) => {
    const source = fs.readFileSync(path.join(core, name), 'utf8');
    const found = forbidden
      .filter(({ pattern }) => pattern.test(source))
      .map(({ name: what }) => what);
    expect(found).toEqual([]);
  });

  test('the rule inspects something', () => {
    expect(modules.length).toBeGreaterThan(5);
  });
});

/**
 * @jest-environment node
 *
 * Every string a catalogue holds is one the code reads (#190). A string nothing reads is still translated, spelled and
 * kept in step between languages, and it says the page does something it does not: `print.json`'s "continued" and its
 * running footer outlived pdfmake (#153), as did `cv.json`'s "Portfolio" contact and "As of" date.
 *
 * A key counts as read when the code names it whole, quoted or after its namespace, as `t('cv:letter.closing')` and
 * `data-i18n="layouts.nerd"` do. A key the code also builds, as `cv:sections.${key}`, is still held to being named: a
 * family let through by its prefix would pass a dead label in it (the code review of #204), and the page names every
 * section it labels.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const leafKeys = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) => {
    const qualified = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? leafKeys(value, qualified) : [qualified];
  });

// The code a reader runs: everything tracked but the tests, the vendored libraries and the catalogues themselves.
const code = execFileSync('git', ['ls-files', '*.js', '*.mjs', '*.html'], {
  cwd: root,
  encoding: 'utf8'
})
  .split('\n')
  .filter((file) => file && !/^(tests|vendor)\//.test(file))
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const named = (key) => new RegExp(`['"\`:]${escape(key)}['"\`]`).test(code);

const catalogues = fs
  .readdirSync(path.join(root, 'locales', 'en'))
  .filter((name) => name.endsWith('.json'))
  .flatMap((name) =>
    leafKeys(JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en', name), 'utf8'))).map(
      (key) => [name, key]
    )
  );

describe('the catalogues', () => {
  test.each(catalogues)('%s holds %s, which the code reads', (name, key) => {
    expect(named(key)).toBe(true);
  });

  test('a label in a family the code builds still fails when nothing names it', () => {
    expect(named('sections.deadThing')).toBe(false);
  });
});

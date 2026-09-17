/**
 * @jest-environment node
 *
 * Every string a catalogue holds is one the code reads (#190). A string nothing reads is still translated, spelled and
 * kept in step between languages, and it says the page does something it does not: `print.json`'s "continued" and its
 * running footer outlived pdfmake (#153), as did `cv.json`'s "Portfolio" contact and "As of" date.
 *
 * A key counts as read when the code names it whole, quoted or after its namespace, as `t('cv:letter.closing')` and
 * `data-i18n="layouts.nerd"` do. A key the code only builds, as `cv:sections.${key}`, is read through its family, which
 * is listed below with the code that builds it, so the family cannot outlive its builder either.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Families of keys the code builds rather than names, each with the text that builds them. */
const BUILT = [{ family: 'sections.', builder: '`cv:sections.${key}`' }];

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
// A key of one word is too common a word to find alone ("footer" is also an element), so it counts only when named with
// its namespace.
const named = (catalogue, key) =>
  key.includes('.')
    ? new RegExp(`['"\`:]${escape(key)}['"\`]`).test(code)
    : code.includes(`${catalogue.replace(/\.json$/, '')}:${key}`);

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
    const family = BUILT.find((built) => key.startsWith(built.family));

    expect(named(name, key) || Boolean(family)).toBe(true);
  });

  test.each(BUILT)('the $family family is still built by the code', ({ builder }) => {
    expect(code.includes(builder)).toBe(true);
  });
});

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const namespaces = ['ui', 'cv', 'print'];
const read = (locale, namespace) =>
  JSON.parse(fs.readFileSync(path.join(root, 'locales', locale, `${namespace}.json`), 'utf8'));
const leafKeys = (object, prefix = '') =>
  Object.entries(object)
    .flatMap(([key, value]) => {
      const qualified = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === 'object' ? leafKeys(value, qualified) : [qualified];
    })
    .sort();

describe('locale catalogs', () => {
  test.each(namespaces)('%s has matching English and German keys', (namespace) => {
    expect(leafKeys(read('de', namespace))).toEqual(leafKeys(read('en', namespace)));
  });
});

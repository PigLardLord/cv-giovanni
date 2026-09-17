/**
 * @jest-environment node
 *
 * Every helper `renderers/inlineSeparator.js` exports is one something uses (#194). `joinSeparated` and
 * `bindSeparators` outlived their last caller, and the file's own header still sent a reader to them as "the safe
 * form": advice to reach for a helper nothing exercised, whose no-break spaces a copy and a parser read.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as separators from '../renderers/inlineSeparator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const module = path.join(root, 'renderers', 'inlineSeparator.js');
const self = fileURLToPath(import.meta.url);

/** Every JavaScript file under a directory, recursively. */
const sources = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.m?js$/.test(entry.name) ? [full] : [];
  });

const readers = ['renderers', 'scripts', 'tests']
  .flatMap((directory) => sources(path.join(root, directory)))
  .filter((file) => file !== module && file !== self)
  .map((file) => fs.readFileSync(file, 'utf8'));

describe('renderers/inlineSeparator.js', () => {
  test.each(Object.keys(separators))('exports %s, which another module reads', (name) => {
    const named = new RegExp(`\\b${name}\\b`);

    expect(readers.some((source) => named.test(source))).toBe(true);
  });
});

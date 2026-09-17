import { posix } from 'node:path';

/**
 * An import or re-export statement's specifier, or a dynamic import's, in the order the source writes them. The run
 * before `from` stops at a semicolon, a quote, a bracket, an equals sign or a slash, so a class body or a comment that
 * happens to say "from 'x'" further down is not read as an import.
 */
const IMPORT =
  /(?:^[ \t]*(?:import|export)\s+(?:[^;'"()=/]*?\s+from\s+)?|\bimport\s*\(\s*)['"]([^'"]+)['"]/gm;

/**
 * The specifiers a module imports, as written: relative paths, `node:` built-ins and packages alike.
 * @param {string} source - A module's source
 * @returns {string[]} The specifiers, in source order
 */
export function importSpecifiers(source) {
  return [...String(source ?? '').matchAll(IMPORT)].map(([, specifier]) => specifier);
}

/**
 * Every module a set of modules reaches through relative imports, themselves included (#181).
 *
 * Read from the imports, never listed by hand: the list kept by hand is the one nobody updates the day a module
 * imports a new one. A package or a built-in is not part of the repository and is left out. A module that is imported
 * but cannot be read is still named, so whoever uses the closure meets the missing file rather than a closure that
 * quietly lacks it.
 * @param {string[]} entries - Paths relative to the repository root, e.g. `core/AtsTextParser.js`
 * @param {(path: string) => (string|null)} read - A module's source, or null when there is none
 * @returns {string[]} The paths, sorted
 */
export function importClosure(entries, read) {
  const reached = new Set();
  const pending = [...entries];
  while (pending.length) {
    const path = pending.pop();
    if (reached.has(path)) continue;
    reached.add(path);
    const source = read(path);
    if (source === null || source === undefined) continue;
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
      const target = posix.normalize(posix.join(posix.dirname(path), specifier));
      if (!target.startsWith('../')) pending.push(target);
    }
  }
  return [...reached].sort();
}

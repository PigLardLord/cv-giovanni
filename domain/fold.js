/**
 * Case and accents off, in one rule for every language rather than one rule each.
 *
 * NFKD splits a letter from its diacritics and the combining marks are dropped, so `à`,
 * `ä` and `é` all fold without a line of their own — which is what makes adding a language
 * a data change. `ß` is the exception no normalisation form covers: it decomposes to
 * itself, so German would silently fail to match without an explicit rule.
 * @param {string} text - Anything
 * @returns {string} The comparable form
 */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

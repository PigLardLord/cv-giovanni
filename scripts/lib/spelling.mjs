/**
 * The CV's words against a dictionary, offline (#152).
 *
 * Spelling errors are the best-measured penalty in CV screening: five of them cut the probability of an interview
 * invitation by 18.5 percentage points, and two by 7.3 (Sterkens et al., PLOS ONE 2023, 445 recruiters). A dictionary
 * does not know a product, a place or a surname, so those are allowed by name, in a committed list a review reads,
 * never by a rule that would let a misspelling through with them.
 *
 * Nothing here loads a dictionary: `correct` is handed in, so each rule can be shown to fail on a word it must catch.
 */

/**
 * A profile's fields that hold an address, a number or a date rather than words. Only a profile's: a catalogue names
 * its labels with the same keys, and "Email", "Phone" and "As of" are words it prints (the code review of #171).
 */
export const PROFILE_NOT_WORDS = new Set(['url', 'email', 'phone', 'asOf']);

/** An i18next placeholder, `{{pageCount}}`: filled in when the string is used, never printed as written. */
const PLACEHOLDER = /\{\{[^}]*\}\}/g;

/** A word: letters and the marks on them, with an apostrophe inside it. A hyphen or a digit ends one. */
const WORD = /\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*/gu;

/**
 * Every word a document writes, with the JSON path of the string that holds it, in the order it is written.
 * @param {object} document - A profile, or a label catalogue
 * @param {{ notWords?: Set<string> }} [options] - Keys whose strings are not words: `PROFILE_NOT_WORDS` for a profile
 * @returns {{ word: string, path: string }[]} The words
 */
export function wordsOf(document, { notWords = new Set() } = {}) {
  const words = [];
  const walk = (node, path, key) => {
    if (typeof node === 'string') {
      if (notWords.has(key)) return;
      for (const [word] of node.replace(PLACEHOLDER, ' ').matchAll(WORD))
        words.push({ word, path });
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, key));
    } else if (node && typeof node === 'object') {
      Object.entries(node).forEach(([name, value]) =>
        walk(value, path ? `${path}.${name}` : name, name)
      );
    }
  };
  walk(document, '', '');
  return words;
}

/**
 * The words a dictionary does not know and the allow-list does not name, once for each place they are written.
 * @param {{ word: string, path: string }[]} words - From `wordsOf`
 * @param {{ correct: (word: string) => boolean, allowed: Set<string> }} spelling - The dictionary's judgement, and the
 *   terms allowed by name
 * @returns {string[]} Each unknown word and where it is, as `"word" at path`
 */
export function misspelt(words, { correct, allowed }) {
  const found = words
    .filter(({ word }) => !allowed.has(word) && !correct(word))
    .map(({ word, path }) => `"${word}" at ${path}`);
  return [...new Set(found)];
}

/**
 * The terms an allow-list file names: one a line, `#` starting a comment.
 * @param {string} text - The file
 * @returns {Set<string>} The terms
 */
export function allowList(text) {
  return new Set(
    text
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean)
  );
}

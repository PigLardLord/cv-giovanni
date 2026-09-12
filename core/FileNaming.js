/**
 * The words of a name as a filename can carry them.
 *
 * A letter loses its accent rather than the whole letter — `Niccolò` is `Niccolo`, not `Niccol` — and
 * anything that is neither a letter nor a digit becomes a break between words.
 * @param {string} text - A name or a title
 * @returns {string[]} Its words
 */
export function fileWords(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * The candidate's name as every generated file begins: `ada-lovelace-general-en-nerd.pdf`.
 *
 * It used to be that literal, derived from nothing, so a profile for anyone else produced files named
 * after this repository's owner (#34). A profile without a name gets no filename at all: a file named
 * after nobody would still be sent.
 * @param {string} name - The candidate's name, from `CvDocument.identity.name`
 * @returns {string} The name in lower case, its words joined by hyphens
 */
export function nameSlug(name) {
  const words = fileWords(name);
  if (!words.length) {
    throw new Error('A generated file is named after its candidate, and this profile has no name.');
  }
  return words.join('-').toLowerCase();
}

/**
 * What a reader that walks a printed PDF's structure tree meets, as `pdfinfo -struct-text` gives it (#370).
 *
 * Chrome tagged a <strong> as Strong, a type PDF 1.4 does not have, with no RoleMap to say what it stands for, and a
 * poppler-based reader — Evince, Okular, the Linux assistive stack — dropped the element with its text. Selected
 * Impact's figures were exactly that text, and every audit here read the text layer, where they stood whole.
 * @param {{ output: string, errors: string }} tree - What `pdfinfo -struct-text` wrote, and what it complained of
 * @param {string[]} figures - What the tree must still say: Selected Impact's figures
 * @param {{ from?: string, to?: string }} [section] - The headings the figures stand between; the whole tree without
 * @returns {{ wrongTypes: string[], missing: string[] }} Each complaint of an element it rejected, once, and each
 *   figure the tree does not hold
 */
export function treeFindings({ output, errors }, figures, { from, to } = {}) {
  const wrongTypes = [
    ...new Set(
      String(errors ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /wrong type/.test(line))
    )
  ];
  // The tree gives each element's text as a quoted string on a line of its own, its spaces kept: joined, they are the
  // page's sentences again. A figure is read whole, bounded by what is neither a letter nor a digit, and in its
  // section: across the whole tree without its spaces, "4" was found in a phone number and inside "14%" (the review
  // of #371).
  const text = String(output ?? '')
    .split('\n')
    .map((line) => /^\s*"(.*)"\s*$/.exec(line)?.[1])
    .filter((string) => string !== undefined)
    .join(' ')
    .replace(/\s+/g, ' ');
  const start = from === undefined ? 0 : text.indexOf(from);
  const end = to === undefined || start < 0 ? -1 : text.indexOf(to, start);
  const section = start < 0 ? '' : text.slice(start, end < 0 ? undefined : end);
  const whole = (figure) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}.,])${figure
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*')}(?![\\p{L}\\p{N}])`,
      'u'
    ).test(section);
  const missing = figures.filter((figure) => !whole(figure));
  return { wrongTypes, missing };
}

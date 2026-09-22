/**
 * What a reader that walks a printed PDF's structure tree meets, as `pdfinfo -struct-text` gives it (#370).
 *
 * Chrome tagged a <strong> as Strong, a type PDF 1.4 does not have, with no RoleMap to say what it stands for, and a
 * poppler-based reader — Evince, Okular, the Linux assistive stack — dropped the element with its text. Selected
 * Impact's figures were exactly that text, and every audit here read the text layer, where they stood whole.
 * @param {{ output: string, errors: string }} tree - What `pdfinfo -struct-text` wrote, and what it complained of
 * @param {string[]} figures - What the tree must still say: Selected Impact's figures
 * @returns {{ wrongTypes: string[], missing: string[] }} Each complaint of an element it rejected, once, and each
 *   figure the tree does not hold
 */
export function treeFindings({ output, errors }, figures) {
  const wrongTypes = [
    ...new Set(
      String(errors ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /wrong type/.test(line))
    )
  ];
  // The tree breaks a line into its elements' strings, each on a line of its own: compared without its spaces.
  const flat = String(output ?? '').replace(/[\s"]+/g, '');
  const missing = figures.filter((figure) => !flat.includes(figure.replace(/\s+/g, '')));
  return { wrongTypes, missing };
}

/**
 * The `?v=` tokens `index.html` gives its stylesheets and entry script, and which of them a branch left stale (#117).
 *
 * GitHub Pages lets a browser keep a file for ten minutes, so a file that changes without a new name can reach a
 * visitor as the old file beside the new markup (`AGENTS.md`, *What the browser caches*). Edited within a pull
 * request, or across a whole branch, a versioned file kept its token more than once, and nothing noticed.
 */

/**
 * Every file the page loads with a `?v=` token, and its token.
 * @param {string} html - The page's markup
 * @returns {{ file: string, token: string }[]} In the order the page names them
 */
export function versionedFiles(html) {
  return [...String(html).matchAll(/(?:href|src)="([^"?#]+)\?v=([^"&#]+)"/g)].map(
    ([, file, token]) => ({ file, token })
  );
}

/**
 * The versioned files a branch changed and left under the token they had before it.
 *
 * A file the page versioned only after the branch began is not stale: its token is new with it.
 * @param {{ changed: string[], before: string, after: string }} branch - The files that differ from where the branch
 *   began, and the page's markup there and now
 * @returns {string[]} Each stale file, as the page names it
 */
export function staleTokens({ changed, before, after }) {
  const was = new Map(versionedFiles(before).map(({ file, token }) => [file, token]));
  const edited = new Set(changed);
  return versionedFiles(after)
    .filter(({ file, token }) => edited.has(file) && was.get(file) === token)
    .map(({ file }) => file);
}

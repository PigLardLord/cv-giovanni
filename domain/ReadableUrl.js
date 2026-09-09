/**
 * The form of an address a person can read off a page and type back in.
 *
 * A link is two different things at once: a target a machine follows, and a string a
 * reader retypes. On paper and in a PDF only the second survives — a PDF link annotation
 * carries the URL, but the text layer carries only what was drawn, so a document that
 * draws "GitHub" over a hyperlink hands a text extractor no address at all.
 *
 * The scheme, `www.` and any trailing slash come off because none of them helps the person
 * typing, and the rest stays exactly as written: a shortened address is a wrong address.
 * @param {string} url - The link target
 * @param {string} [fallback] - What to show when there is no usable URL
 * @returns {string} The address as it should be drawn
 */
export function readableAddress(url, fallback = '') {
  if (typeof url !== 'string' || url.trim() === '') return fallback;

  const readable = url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');

  return readable || fallback;
}

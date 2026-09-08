/**
 * Loads a named layout's stylesheets on top of the base ones.
 *
 * A layout is presentation only: it never touches the profile and never asks a
 * renderer for different markup. The renderers emit every form the data
 * supports — the compact skill run *and* the rated badges — and a layout hides
 * what it does not want. That is what keeps a layout from quietly deleting
 * data, which is how `level` and `interests` were lost the first time round.
 *
 * The default layout is whatever `index.html` already links; a named layout is
 * added after it, so it only has to state its differences.
 */
export class LayoutLoader {
  /**
   * @param {Document} root - Document to load into
   * @param {string} [base] - Directory holding the layouts
   */
  constructor(root = typeof document !== 'undefined' ? document : null,
              base = 'layouts') {
    this.root = root;
    this.base = base;
  }

  /**
   * The layout asked for in the URL, if any.
   *
   * Restricted to a plain name: this string becomes part of a URL, so anything
   * with a slash or a dot is refused rather than allowed to walk the path.
   *
   * @param {string} [search] - Query string to read
   * @returns {string|null} Layout name, or null for the default
   */
  requestedLayout(search) {
    const query = search !== undefined ? search
      : (typeof location !== 'undefined' ? location.search : '');
    const name = new URLSearchParams(query).get('layout');
    return name && /^[a-z][a-z0-9-]*$/.test(name) ? name : null;
  }

  /**
   * Add a layout's screen and print stylesheets to the document.
   * @param {string} name - Layout name
   * @returns {Element[]} The links that were added
   */
  load(name) {
    if (!name || !this.root || !this.root.head) return [];

    return [
      this.addStylesheet(`${this.base}/${name}/screen.css`, ''),
      this.addStylesheet(`${this.base}/${name}/print.css`, 'print')
    ].filter(Boolean);
  }

  addStylesheet(href, media) {
    const link = this.root.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (media) link.media = media;
    link.dataset.layout = 'true';
    this.root.head.appendChild(link);
    return link;
  }

  /**
   * Load whichever layout the URL asked for.
   * @returns {string|null} The layout that was loaded
   */
  loadRequested() {
    const name = this.requestedLayout();
    if (name) this.load(name);
    return name;
  }
}

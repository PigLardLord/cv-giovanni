import { BaseRenderer } from './BaseRenderer.js';
import { runningFooterParts } from '../core/RunningFooter.js';

/**
 * Hands the printed page the line that says, from page 2 on, whose CV it is (#158).
 *
 * Paper prints the line in a page-margin box, and a margin box's content cannot read the page: no `attr()`, no element
 * it can copy. So the renderer writes it as CSS, one print-only rule in the head, after print.css, whose own rule for
 * the box says nothing. What the line says comes from `core/RunningFooter.js`, from the model's name and the print
 * catalogue; how it looks, and that page 1 carries none, is print.css's. The page counters stay counters, since only
 * the browser knows the page count once it has laid the page out.
 */
export class RunningFooterRenderer extends BaseRenderer {
  constructor(i18n = null) {
    super();
    this.i18n = i18n;
  }

  render(root, data) {
    const head = root?.head;
    if (!head) return;

    const parts =
      this.i18n && this.validate(data)
        ? runningFooterParts(data.identity?.name, (key, values) => this.i18n.t(key, values))
        : [];
    // Replaced, never added to: a rule left from an earlier render would name someone else.
    head.querySelectorAll('style[data-running-footer]').forEach((style) => style.remove());
    if (!parts.length) return;

    const style = this.createElement(root, 'style');
    style.setAttribute('media', 'print');
    style.setAttribute('data-running-footer', '');
    style.textContent = `@page { @bottom-right { content: ${this.contentOf(parts)}; } }`;
    // Last in the head, so its rule comes after print.css's and replaces the box's `content: none`.
    head.appendChild(style);
  }

  /**
   * The footer's parts as the value of a CSS `content` declaration: each text a CSS string, each page counter a
   * `counter()`.
   * @param {(string|{ counter: 'page'|'pages' })[]} parts - From `runningFooterParts`
   * @returns {string} The value
   */
  contentOf(parts) {
    return parts
      .map((part) =>
        typeof part === 'string'
          ? cssString(part)
          : part.counter === 'page'
            ? 'counter(page)'
            : 'counter(pages)'
      )
      .join(' ');
  }
}

/**
 * Text as a CSS string. A quote would close it and a backslash start an escape, so both are escaped; a line break
 * cannot stand in a CSS string at all, so each is written as the escape `\A`, whose trailing space ends the escape.
 * @param {string} text - The text
 * @returns {string} The string, in double quotes
 */
function cssString(text) {
  return `"${text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|[\n\r\f]/g, '\\A ')}"`;
}

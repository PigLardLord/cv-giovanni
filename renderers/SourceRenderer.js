import { BaseRenderer } from './BaseRenderer.js';
import { SwiftSourceLayout } from '../adapters/SwiftSourceLayout.js';

/**
 * Writes the CV into Nerd Mode's editor as a Swift file, and its contact card into the phone.
 *
 * Every decision — which lines, which tokens, what is syntax and what is content, what the card
 * shows — is made by `adapters/SwiftSourceLayout.js`. This only turns its output into elements,
 * and keeps the rules that make the editor safe to read:
 *
 * - Syntax is an empty, `aria-hidden` element whose `data-code` the stylesheet draws, and content
 *   is real text. The line numbers and the file's name are drawn the same way.
 * - The card repeats what the file already says, so its words are drawn from `data-text` and kept
 *   from assistive technology. What looks like a button is one: each action is a link with a name
 *   of its own, and nothing focusable sits inside anything `aria-hidden` that can be tabbed to.
 */
export class SourceRenderer extends BaseRenderer {
  constructor(i18n = null, layout = new SwiftSourceLayout()) {
    super();
    this.i18n = i18n;
    this.layout = layout;
  }

  render(root, data) {
    const code = this.getElement(root, 'source-code');
    if (!code || !this.validate(data)) return;

    const source = this.layout.compose(data, {
      t: (key, options) => (this.i18n ? this.i18n.t(key, options) : key)
    });

    code.textContent = '';
    source.lines.forEach((line) => code.appendChild(this.createLine(root, line)));

    root.querySelectorAll('[data-source-file]').forEach((slot) => {
      slot.textContent = '';
      slot.dataset.text = source.fileName;
    });

    this.renderOutline(root, source.outline);
    this.renderCard(root, source.card);
  }

  renderOutline(root, outline) {
    const container = this.getElement(root, 'source-outline');
    if (!container) return;

    container.textContent = '';
    outline.forEach(({ id, label }) => {
      const link = this.createElement(root, 'a');
      link.href = `#${id}`;
      link.textContent = label;
      const item = this.createElement(root, 'li');
      item.appendChild(link);
      container.appendChild(item);
    });
  }

  renderCard(root, card) {
    const container = this.getElement(root, 'source-card');
    if (!container) return;

    container.textContent = '';
    container.removeAttribute('aria-hidden');
    container.appendChild(this.drawn(root, 'p', 'app-name', card.name, true));
    if (card.title) container.appendChild(this.drawn(root, 'p', 'app-title', card.title, true));

    if (card.actions.length > 0) {
      const actions = this.createElement(root, 'ul', 'app-actions');
      card.actions.forEach(({ icon, label, name, href }) => {
        const action = this.createAddress(root, href);
        action.classList.add('app-action');
        action.dataset.icon = icon;
        action.dataset.text = label;
        action.setAttribute('aria-label', name);
        const item = this.createElement(root, 'li');
        item.appendChild(action);
        actions.appendChild(item);
      });
      container.appendChild(actions);
    }

    // The details repeat the actions for a pointer; a keyboard and a screen reader already have
    // the actions, so the rows stay out of both.
    if (card.rows.length > 0) {
      const rows = this.createElement(root, 'ul', 'app-rows');
      rows.setAttribute('aria-hidden', 'true');
      card.rows.forEach(({ kind, label, value, href }) => {
        const row = this.createElement(root, 'li', 'app-row');
        row.dataset.kind = kind;
        row.appendChild(this.drawn(root, 'span', 'app-row-label', label));

        const detail = href ? this.createAddress(root, href) : this.createElement(root, 'span');
        detail.classList.add('app-row-value');
        detail.dataset.text = value;
        if (href) detail.setAttribute('tabindex', '-1');
        row.appendChild(detail);
        rows.appendChild(row);
      });
      container.appendChild(rows);
    }
  }

  createLine(root, line) {
    const element = this.createElement(
      root,
      line.heading ? `h${line.heading}` : 'div',
      'source-line'
    );
    element.dataset.depth = String(line.depth);
    if (line.id) element.id = line.id;
    if (line.current) element.classList.add('is-current');

    const number = this.createElement(root, 'span', 'source-number');
    number.setAttribute('aria-hidden', 'true');
    element.appendChild(number);

    line.tokens.forEach((token) => element.appendChild(this.createToken(root, token)));
    return element;
  }

  createToken(root, token) {
    if ('code' in token) {
      const syntax = this.createElement(root, 'span', ['tok', `tok-${token.kind}`]);
      syntax.dataset.code = token.code;
      syntax.setAttribute('aria-hidden', 'true');
      return syntax;
    }

    const element =
      token.element === 'a'
        ? this.createAddress(root, token.href, token.text)
        : this.createElement(root, token.element || 'span');
    element.classList.add('tok', `tok-${token.kind}`);
    element.textContent = token.text;
    return element;
  }

  /** A link to an address: a web page opens in a tab of its own; a mail or a call does not. */
  createAddress(root, href, text = '') {
    if (/^https?:/i.test(href)) return this.createLink(root, href, text);

    const link = this.createElement(root, 'a');
    link.href = href;
    link.textContent = text;
    return link;
  }

  /** An element whose words the stylesheet draws from `data-text`. */
  drawn(root, tag, className, text, hidden = false) {
    const element = this.createElement(root, tag, className);
    element.dataset.text = text;
    if (hidden) element.setAttribute('aria-hidden', 'true');
    return element;
  }
}

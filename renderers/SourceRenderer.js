import { BaseRenderer } from './BaseRenderer.js';
import { SwiftSourceLayout } from '../adapters/SwiftSourceLayout.js';

/**
 * Writes the CV into Nerd Mode's editor as a Swift file, and its contact card into the phone.
 *
 * Every decision — which lines, which tokens, what is syntax and what is content, what the card
 * shows — is made by `adapters/SwiftSourceLayout.js`. This only turns its output into elements,
 * and keeps the two rules that make the editor safe to read:
 *
 * - Syntax is an empty, `aria-hidden` element whose `data-code` the stylesheet draws, and content
 *   is real text. The line numbers are drawn the same way, from a CSS counter.
 * - The card repeats what the file already says, so it is a picture: `aria-hidden`, and every word
 *   on it drawn from `data-text`. Nobody hears the name twice or copies it out of a phone.
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
      t: (key) => (this.i18n ? this.i18n.t(key) : key)
    });

    code.textContent = '';
    source.lines.forEach((line) => code.appendChild(this.createLine(root, line)));

    root.querySelectorAll('[data-source-file]').forEach((slot) => {
      slot.textContent = source.fileName;
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
    container.setAttribute('aria-hidden', 'true');
    container.appendChild(this.drawn(root, 'p', 'app-name', card.name));
    if (card.title) container.appendChild(this.drawn(root, 'p', 'app-title', card.title));

    if (card.actions.length > 0) {
      const actions = this.createElement(root, 'ul', 'app-actions');
      card.actions.forEach(({ icon, label }) => {
        const action = this.drawn(root, 'li', 'app-action', label);
        action.dataset.icon = icon;
        actions.appendChild(action);
      });
      container.appendChild(actions);
    }

    if (card.rows.length > 0) {
      const rows = this.createElement(root, 'ul', 'app-rows');
      card.rows.forEach(({ kind, label, value }) => {
        const row = this.createElement(root, 'li', 'app-row');
        row.dataset.kind = kind;
        row.appendChild(this.drawn(root, 'span', 'app-row-label', label));
        row.appendChild(this.drawn(root, 'span', 'app-row-value', value));
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
        ? this.createLink(root, token.href, token.text)
        : this.createElement(root, token.element || 'span');
    element.classList.add('tok', `tok-${token.kind}`);
    element.textContent = token.text;
    return element;
  }

  /** An element whose words the stylesheet draws from `data-text`. */
  drawn(root, tag, className, text) {
    const element = this.createElement(root, tag, className);
    element.dataset.text = text;
    return element;
  }
}

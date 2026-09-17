import { BaseRenderer } from './BaseRenderer.js';
import { SwiftSourceLayout } from '../adapters/SwiftSourceLayout.js';
import { DASH_GLYPHS, holdSeparators } from './inlineSeparator.js';

/**
 * How far below the pinned tab row a heading may sit and still count as reached. A jump from the
 * navigator lands a heading 12px below that row (`scroll-margin-top` in layouts.css), so the section
 * a reader just jumped to must be the one marked; the rest is rounding.
 */
const LANDING_SLACK = 16;

/**
 * A value's last word: what follows its last space, slash or hyphen, where a line of the editor would otherwise break
 * before it. An address breaks after a slash, so "linkedin.com/in/" / "piglardlord" keeps its `),` on a row of 210px
 * at 320px, where the whole address with it would not fit (#219).
 */
const LAST_WORD = /[^\s/-]*[/-]*$/u;

/**
 * A period's first end, up to and with its dash, and its second, from the space after the dash. Held apart, the ends
 * give a line one place to break, after the dash; the space held with the second is no place a line prefers to break,
 * so a period moves down a row whole where it fits one (#180, #219).
 */
const PERIOD_ENDS = new RegExp(`^(.*?[${DASH_GLYPHS.join('')}])(\\s*.+)$`, 'su');

/**
 * Writes the CV into Nerd Mode's editor as a Swift file, and its contact card into the phone.
 *
 * Every decision — which lines, which tokens, what is syntax and what is content, what the card
 * shows — is made by `adapters/SwiftSourceLayout.js`. This only turns its output into elements,
 * and keeps the rules that make the editor safe to read:
 *
 * - Syntax is an empty, `aria-hidden` element whose `data-code` the stylesheet draws, and content
 *   is real text. The line numbers and the file's name are drawn the same way, and so is an escape
 *   inside a value, beside the text it escapes (#160).
 * - Syntax the layout marks as closing a value is held to the value's last word in one `no-break`
 *   element, since the editor's lines break anywhere and a narrow one left a lone `",` on a row of
 *   its own (#219).
 * - The card repeats what the file already says, so its words are drawn from `data-text` and kept
 *   from assistive technology. What looks like a button is one: each action is a link with a name
 *   of its own — or, for "call", a button that opens the alert — and nothing focusable sits inside
 *   anything `aria-hidden` that can be tabbed to.
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
      locale: this.i18n?.language || 'en',
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
    this.renderAlert(root, source.card.call);
    this.trackSectionInView(root);
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

  /**
   * Keeps the navigator's link to the section in view marked with `aria-current="location"`.
   *
   * Below a laptop the navigator is the pinned row of links above the file, and the mark is the only
   * way to tell where in a 4,000px file the reader is; above it, it is the same courtesy in a column.
   * Registered once per renderer: rendering again replaces the listener rather than adding one.
   */
  trackSectionInView(root) {
    const view = root.defaultView;
    if (!view) return;

    if (this.sectionTracker) {
      ['scroll', 'resize', 'hashchange'].forEach((type) =>
        view.removeEventListener(type, this.sectionTracker)
      );
    }
    let pending = false;
    const update = () => {
      pending = false;
      this.markSectionInView(root);
    };
    this.sectionTracker = () => {
      if (typeof view.requestAnimationFrame !== 'function') return update();
      if (pending) return;
      pending = true;
      view.requestAnimationFrame(update);
    };
    // hashchange as well as scroll: a jump between two sections already on screen scrolls nothing.
    ['scroll', 'resize', 'hashchange'].forEach((type) =>
      view.addEventListener(type, this.sectionTracker, { passive: true })
    );
    this.markSectionInView(root);
  }

  /**
   * The section in view is the last one whose heading has reached the bottom of the pinned tab row.
   * Above the first heading — the name, the summary — nothing is marked.
   */
  markSectionInView(root) {
    const tabs = this.querySelector(root, '.source-tabs');
    const links = [...root.querySelectorAll('#source-outline a')];
    if (!tabs || links.length === 0) return;

    const reached = tabs.getBoundingClientRect().bottom + LANDING_SLACK;
    const headings = [...root.querySelectorAll('#source-code h2[id]')];
    const current =
      this.jumpedTo(root, headings) ||
      headings.filter((heading) => heading.getBoundingClientRect().top <= reached).pop();
    const href = current ? `#${current.id}` : null;

    links.forEach((link) => {
      if (link.getAttribute('href') === href) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });

    // A keyboard reader moving along the row keeps the link they are on in view. A tap focuses a link
    // without `:focus-visible`, so for everyone else the row follows the mark.
    const focused = links.find((link) => link.matches(':focus-visible'));
    const shown = focused || links.find((link) => link.getAttribute('href') === href);
    if (shown) this.keepInRow(shown.closest('.source-navigator'), shown);
  }

  /**
   * The section a jump went to, when the page ends before its heading can reach the pinned row.
   *
   * The last sections of the file are shorter than the window, so the page stops scrolling with their
   * headings still lower down, and the position alone would keep the section before them marked. At
   * the end of the page, and only while its heading is on screen, the address the reader jumped to
   * decides. Scroll back up and the position decides again.
   */
  jumpedTo(root, headings) {
    const view = root.defaultView;
    if (!view) return null;
    let id;
    try {
      id = decodeURIComponent((view.location.hash || '').slice(1));
    } catch {
      // `#%`, typed by hand, names no heading: the position decides.
      return null;
    }
    const target = id ? headings.find((heading) => heading.id === id) : null;
    if (!target) return null;

    const atEnd = view.scrollY + view.innerHeight >= root.documentElement.scrollHeight - 2;
    const top = target.getBoundingClientRect().top;
    return atEnd && top >= 0 && top < view.innerHeight ? target : null;
  }

  /** Scrolls a row of links sideways just far enough that the given link is wholly inside it. */
  keepInRow(row, link) {
    if (!row) return;
    const start = link.offsetLeft;
    const end = start + link.offsetWidth;
    if (start < row.scrollLeft) row.scrollLeft = start;
    else if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth;
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
      card.actions.forEach(({ icon, label, name, href, dialog }) => {
        const action = dialog
          ? this.createDialogButton(root, `source-${dialog}`)
          : this.createAddress(root, href);
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

  /** The call alert's words, or none when the profile has no number to joke about. */
  renderAlert(root, call) {
    [
      ['source-call-title', call ? call.title : ''],
      ['source-call-message', call ? call.message : ''],
      ['source-call-dismiss', call ? call.dismiss : '']
    ].forEach(([id, text]) => {
      const element = this.getElement(root, id);
      if (element) element.textContent = text;
    });
  }

  /** A button that opens a dialog as a modal, so the dialog takes focus and closes on Escape. */
  createDialogButton(root, id) {
    const button = this.createElement(root, 'button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', id);
    button.addEventListener('click', () => {
      const dialog = root.getElementById(id);
      if (!dialog || dialog.open) return;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    return button;
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

    line.tokens.forEach((token, index) => {
      if (token.closes) return;
      const closing = [];
      for (let next = index + 1; line.tokens[next]?.closes; next += 1) {
        closing.push(this.createToken(root, line.tokens[next]));
      }
      const value = this.createToken(root, token);
      element.appendChild(closing.length > 0 ? this.holdClosing(root, value, closing) : value);
    });
    return element;
  }

  /**
   * A value with the syntax that closes it, which no row of the editor opens with (#219). The two share a `no-break`
   * element with the value's last word, so a line too narrow for them breaks before that word.
   *
   * The syntax goes inside the value, beside its last word, or beside the element that ends it. A link underlines
   * everything inside it, so a link keeps to its own text: the link and the syntax share a `no-break` span, and the
   * words of the link before its last one go into a `source-wrap` span, where they wrap again.
   * @param {Document} root - DOM root
   * @param {Element} value - The value, as `createToken` writes it
   * @param {Element[]} closing - The syntax that closes it, in order
   * @returns {Element} What the line holds in the value's place
   */
  holdClosing(root, value, closing) {
    const word = this.lastWordOf(value);
    if (value.tagName === 'A') {
      const before = [...value.childNodes].slice(0, [...value.childNodes].indexOf(word));
      if (before.length > 0) {
        const wraps = this.createElement(root, 'span', 'source-wrap');
        wraps.append(...before);
        value.prepend(wraps);
      }
      const held = this.createElement(root, 'span', 'no-break');
      held.append(value, ...closing);
      return held;
    }
    const held = this.createElement(root, 'span', 'no-break');
    word.replaceWith(held);
    held.append(word, ...closing);
    return value;
  }

  /**
   * The node that ends a value, which is never empty: its last text split at its last word first.
   * @param {Element} value - The value
   * @returns {Node} The text of the value's last word, or the element that ends it
   */
  lastWordOf(value) {
    const last = value.lastChild;
    if (last.nodeType !== last.TEXT_NODE) return last;
    const word = last.data.match(LAST_WORD)[0] || last.data.slice(-1);
    return word.length < last.data.length ? last.splitText(last.data.length - word.length) : last;
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
    // A value the layout marks whole, a period, never wraps inside either end, however narrow the editor (#180).
    element.textContent = '';
    // A separator in a value stays with the words either side of it: the editor wrapped "EU citizen ·" (#180).
    if (!token.parts) {
      return this.appendPieces(
        root,
        element,
        token.whole ? this.periodEnds(root, token.text) : holdSeparators(root, token.text)
      );
    }
    token.parts.forEach((part) => element.appendChild(this.createPart(root, part, token.kind)));
    return element;
  }

  /**
   * A period's ends, each held: "September 2015 –" and " July 2018" (#180, #219).
   * @param {Document} root - DOM root
   * @param {string} period - The period as the profile writes it
   * @returns {Element[]} A `no-break` span for each end, or one for a period with no dash
   */
  periodEnds(root, period) {
    const [, first, second] = PERIOD_ENDS.exec(period) ?? [];
    return (first ? [first, second] : [period]).map((end) =>
      this.createElement(root, 'span', 'no-break', end)
    );
  }

  /** A piece of a value: an escape drawn like any syntax, a character kept in the text out of sight, or the text. */
  createPart(root, part, kind) {
    if ('code' in part) return this.createToken(root, { code: part.code, kind });
    if (!part.unseen) {
      return this.appendPieces(
        root,
        root.createDocumentFragment(),
        holdSeparators(root, part.text)
      );
    }
    const unseen = this.createElement(root, 'span', 'tok-unseen');
    unseen.textContent = part.text;
    return unseen;
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

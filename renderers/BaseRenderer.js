import { Renderer } from '../interfaces/Renderer.js';
import { createSeparatorElement } from './inlineSeparator.js';

/**
 * Base renderer with common DOM manipulation utilities
 * Reduces code duplication across all renderers
 */
export class BaseRenderer extends Renderer {
  /**
   * Safely get DOM element by ID
   * @param {Document} root - DOM root
   * @param {string} id - Element ID
   * @returns {Element|null} Element or null if not found
   */
  getElement(root, id) {
    return root.getElementById(id);
  }

  /**
   * Safely get DOM element by selector
   * @param {Document} root - DOM root
   * @param {string} selector - CSS selector
   * @returns {Element|null} Element or null if not found
   */
  querySelector(root, selector) {
    return root.querySelector(selector);
  }

  /**
   * Create DOM element with class and content
   * @param {Document} root - DOM root
   * @param {string} tag - HTML tag name
   * @param {string|string[]} className - CSS class(es)
   * @param {string} content - innerHTML content
   * @returns {Element} Created element
   */
  createElement(root, tag, className = '', content = '') {
    const element = root.createElement(tag);
    if (className) {
      if (Array.isArray(className)) {
        element.classList.add(...className);
      } else {
        element.className = className;
      }
    }
    if (content) {
      element.innerHTML = content;
    }
    return element;
  }

  /**
   * Write prose into an element, holding every hyphenated compound together.
   *
   * A line that breaks at an existing hyphen extracts from a PDF with the
   * hyphen gone — "offline-first" reaches a parser as "offlinefirst", which is
   * invisible on the page and unfindable by anyone searching the canonical
   * spelling. Each compound becomes an atomic inline box, so the line breaks
   * around it rather than inside it. This is the DOM counterpart of the PDF's
   * `noWrap` runs, and the reason it lives here rather than in a stylesheet is
   * that no CSS property can forbid a break at an explicit hyphen.
   *
   * The text itself is untouched: textContent, copy/paste, the accessibility
   * tree and the extracted PDF all read exactly what the data wrote.
   * @param {Document} root - DOM root
   * @param {Element} element - Element to fill
   * @param {string} text - Prose as the data wrote it
   * @returns {Element} The element that was filled
   */
  setProse(root, element, text) {
    element.textContent = '';
    const parts = String(text ?? '').split(/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)/g);
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        const held = this.createElement(root, 'span', 'no-break');
        held.textContent = part;
        element.appendChild(held);
        return;
      }
      element.appendChild(root.createTextNode(part));
    });
    return element;
  }

  /**
   * Render array of items to a container
   * @param {Element} container - Container element
   * @param {Array} items - Items to render
   * @param {Function} itemRenderer - Function to render each item
   */
  renderItems(container, items, itemRenderer) {
    if (!container || !Array.isArray(items)) return;

    items.forEach((item, index) => {
      const element = itemRenderer(item, index);
      if (element) {
        container.appendChild(element);
      }
    });
  }

  /**
   * Create link element with security attributes
   * @param {Document} root - DOM root
   * @param {string} url - Link URL
   * @param {string} text - Link text
   * @param {string} className - CSS class
   * @returns {Element} Link element
   */
  createLink(root, url, text, className = '') {
    const link = this.createElement(root, 'a', className);
    link.href = url;
    link.textContent = text;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  /**
   * Append nodes to a container, joined by a real separator element.
   *
   * @param {Document} root - DOM root
   * @param {Element} container - Container to append into
   * @param {Element[]} nodes - Nodes to join
   */
  appendSeparated(root, container, nodes) {
    nodes.forEach((node, index) => {
      if (index > 0) {
        container.appendChild(createSeparatorElement(root));
      }
      container.appendChild(node);
    });
  }

  /**
   * Show or hide the section that owns a container.
   *
   * The section headings and their accent rules live in the static template, so
   * an empty data set would otherwise leave a heading, a rule and a block of
   * reserved space behind. Toggling `hidden` rather than removing the node
   * keeps the section reusable when data is swapped back in.
   * @param {Element} container - Element the renderer fills
   * @param {boolean} hasContent - Whether anything was rendered
   */
  setSectionVisibility(container, hasContent) {
    const section = container && container.closest ? container.closest('section') : null;
    if (!section) return;

    if (hasContent) {
      section.removeAttribute('hidden');
    } else {
      section.setAttribute('hidden', '');
    }
  }

  /**
   * A list of names as individual elements, joined by real separator text.
   *
   * The separators are text nodes, not CSS: `textContent` still reads "Swift, SwiftUI", so
   * copy/paste and any parser see the list the way the data wrote it. A layout that wants
   * chips or pills hides `.<kind>-sep` and styles `.<kind>-chip` — the punctuation goes and
   * the meaning stays, which is the rule `AGENTS.md` sets for every visual device here.
   * @param {Document} root - DOM root
   * @param {Element} container - element to fill
   * @param {string[]} names - the names, already trimmed
   * @param {string} kind - class prefix, e.g. 'skill' or 'interest'
   * @param {string} separator - what sits between two names
   */
  appendNamed(root, container, names, kind, separator = ', ') {
    names.forEach((name, index) => {
      if (index > 0) {
        container.appendChild(this.createElement(root, 'span', `${kind}-sep`, separator));
      }
      const chip = this.createElement(root, 'span', `${kind}-chip`);
      chip.textContent = name;
      container.appendChild(chip);
    });
  }

  /**
   * Validate that required data fields exist
   * @param {Object} data - Data object
   * @param {string[]} fields - Required field names
   * @returns {boolean} True if all fields exist
   */
  validateFields(data, fields) {
    return super.validate(data) && fields.every((field) => data[field] !== undefined);
  }
}

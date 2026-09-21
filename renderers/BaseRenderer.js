import { Renderer } from '../interfaces/Renderer.js';
import { createSeparatorElement, holdSeparators } from './inlineSeparator.js';
import { WORD_CHARACTER } from '../domain/Separators.js';

/** A hyphenated compound or a closed range, in any script: held whole so no line breaks at its hyphen (#251). */
const HELD_COMPOUND = new RegExp(`(${WORD_CHARACTER}+(?:[-–]${WORD_CHARACTER}+)+)`, 'u');

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
   * Create DOM element with class and text.
   *
   * The text is text, never markup: a profile string set as HTML opened a tag at "<0.1%" and turned
   * "AT&amp;T" into "AT&T" (#157). Structure is built node by node, from the renderer's own elements.
   * @param {Document} root - DOM root
   * @param {string} tag - HTML tag name
   * @param {string|string[]} className - CSS class(es)
   * @param {string} text - The element's text
   * @returns {Element} Created element
   */
  createElement(root, tag, className = '', text = '') {
    const element = root.createElement(tag);
    if (className) {
      if (Array.isArray(className)) {
        element.classList.add(...className);
      } else {
        element.className = className;
      }
    }
    if (text) {
      element.textContent = text;
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
   * A separator is held to the words either side of it the same way, so a wrap
   * never strands one at the edge of a line (#180).
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
    return this.appendProse(root, element, text);
  }

  /**
   * Prose appended after what an element already holds, held as `setProse` holds it: a line that sets some of its
   * pieces otherwise — a figure in Bold (#261) — lays the rest out the same way.
   * @param {Document} root - DOM root
   * @param {Element} element - Element to append to
   * @param {string} text - Prose as the data wrote it
   * @returns {Element} The element
   */
  appendProse(root, element, text) {
    // A closed range is held the same way, and for the neighbouring reason: broken at its en dash it leaves
    // "2020–" ending a line, which is the stranded separator #180 forbids (#230).
    const parts = String(text ?? '').split(HELD_COMPOUND);
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        // A run joined only by hyphens is a compound, which a German screen may break at its hyphens when it is
        // wider than the column (#249); a run with a dash in it is a range, and stays whole everywhere.
        const kind = part.includes('–') ? 'no-break' : 'no-break compound';
        const held = this.createElement(root, 'span', kind);
        held.textContent = part;
        element.appendChild(held);
        return;
      }
      this.appendPieces(root, element, holdSeparators(root, part));
    });
    return element;
  }

  /**
   * Append to an element each of its pieces in order: a string as text, an element as itself. How a renderer
   * lays a line out of the data's strings and its own elements without writing markup (#157).
   * @param {Document} root - DOM root
   * @param {Element} element - Element to fill
   * @param {(string|Node|null|undefined)[]} pieces - What the element holds; an empty piece adds nothing
   * @returns {Element} The element that was filled
   */
  appendPieces(root, element, pieces) {
    pieces.forEach((piece) => {
      if (piece === null || piece === undefined || piece === '') return;
      element.appendChild(typeof piece === 'string' ? root.createTextNode(piece) : piece);
    });
    return element;
  }

  /**
   * A line's pieces as nodes: a separator as text, and a field's value in a span of the class `classes` gives that
   * field, or as text when it gives none. The pieces, and which separators they carry, come from the domain (#169).
   * @param {Document} root - DOM root
   * @param {(string|{ field: string, text: string })[]} pieces - A line, from `domain/EntryLines.js`
   * @param {Record<string, string>} classes - The class of the span each field is set in
   * @returns {(string|Element)[]} Pieces for `appendPieces`
   */
  fieldPieces(root, pieces, classes = {}) {
    // Neighbouring text is one text node, as a template wrote it: split in two, the city after ", " shifted by a
    // hundredth of a point in the printed PDF.
    return pieces.reduce((laid, piece) => {
      const spanned = typeof piece !== 'string' && classes[piece.field];
      const next = spanned
        ? this.createElement(root, 'span', classes[piece.field], piece.text)
        : typeof piece === 'string'
          ? piece
          : piece.text;
      if (typeof next === 'string' && typeof laid[laid.length - 1] === 'string') {
        laid[laid.length - 1] += next;
      } else {
        laid.push(next);
      }
      return laid;
    }, []);
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
      // Through setProse, so a hyphenated name is one atomic inline box: the print broke "Dependency-Track"
      // at its hyphen and poppler read it back as "DependencyTrack" (#230).
      this.setProse(root, chip, name);
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

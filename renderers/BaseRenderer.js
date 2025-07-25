import { Renderer } from '../interfaces/Renderer.js';

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
   * Render array of items to a container
   * @param {Element} container - Container element
   * @param {Array} items - Items to render
   * @param {Function} itemRenderer - Function to render each item
   */
  renderItems(container, items, itemRenderer) {
    if (!container || !Array.isArray(items)) return;
    
    items.forEach(item => {
      const element = itemRenderer(item);
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
   * Validate that required data fields exist
   * @param {Object} data - Data object
   * @param {string[]} fields - Required field names
   * @returns {boolean} True if all fields exist
   */
  validateFields(data, fields) {
    return super.validate(data) && fields.every(field => data[field] !== undefined);
  }
}
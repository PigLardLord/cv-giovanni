/**
 * Interface for CV section renderers
 * Follows Interface Segregation Principle (ISP)
 */
export class Renderer {
  /**
   * Renders a CV section into the DOM
   * @param {Document} root - DOM document or element to render into
   * @param {Object} data - CV data object
   * @throws {Error} Must be implemented by subclasses
   */
  render(root, data) {
    throw new Error('render() method must be implemented');
  }

  /**
   * Validates the data required for this renderer
   * @param {Object} data - CV data object
   * @returns {boolean} true if data is valid
   */
  validate(data) {
    return data !== null && data !== undefined;
  }
}
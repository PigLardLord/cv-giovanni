/**
 * Dependency Injection container for CV renderers
 * Follows Dependency Inversion Principle (DIP)
 */
export class RendererContainer {
  constructor() {
    this.renderers = new Map();
  }

  /**
   * Register a renderer
   * @param {string} name - Renderer name
   * @param {Renderer} renderer - Renderer instance
   */
  register(name, renderer) {
    this.renderers.set(name, renderer);
  }

  /**
   * Get a renderer by name
   * @param {string} name - Renderer name
   * @returns {Renderer} Renderer instance
   */
  get(name) {
    const renderer = this.renderers.get(name);
    if (!renderer) {
      throw new Error(`Renderer '${name}' not found`);
    }
    return renderer;
  }

  /**
   * Render all registered renderers
   * @param {Document} root - DOM root
   * @param {Object} data - CV data
   */
  renderAll(root, data) {
    for (const [name, renderer] of this.renderers) {
      try {
        renderer.render(root, data);
      } catch (error) {
        console.error(`Error rendering ${name}:`, error);
      }
    }
  }

  /**
   * Get all renderer names
   * @returns {string[]} Array of renderer names
   */
  getRendererNames() {
    return Array.from(this.renderers.keys());
  }
}
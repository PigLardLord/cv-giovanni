import { DataLoader } from './DataLoader.js';
import { RendererContainer } from './RendererContainer.js';

/**
 * Main CV Application Controller
 * Follows Single Responsibility Principle (SRP) and Dependency Inversion Principle (DIP)
 */
export class CVApplication {
  constructor(dataLoader = new DataLoader(), rendererContainer = new RendererContainer()) {
    this.dataLoader = dataLoader;
    this.rendererContainer = rendererContainer;
    this.isInitialized = false;
  }

  /**
   * Register a renderer with the application
   * @param {string} name - Renderer name
   * @param {Renderer} renderer - Renderer instance
   */
  registerRenderer(name, renderer) {
    this.rendererContainer.register(name, renderer);
  }

  /**
   * Initialize and render the CV application
   * @param {Document} root - DOM document to render into
   */
  async initialize(root) {
    try {
      const data = await this.dataLoader.loadCVData();
      this.rendererContainer.renderAll(root, data);
      this.isInitialized = true;
    } catch (error) {
      this.handleError(root, error);
    }
  }

  /**
   * Handle application errors
   * @param {Document} root - DOM document
   * @param {Error} error - Error that occurred
   */
  handleError(root, error) {
    console.error('CV Application Error:', error);
    root.body.innerHTML = `
      <div style="text-align: center; padding: 50px; color: #666;">
        <h2>Error Loading CV</h2>
        <p>${error.message}</p>
        <p>Please check the console for more details.</p>
      </div>
    `;
  }

  /**
   * Get application status
   * @returns {boolean} True if initialized successfully
   */
  getStatus() {
    return this.isInitialized;
  }
}
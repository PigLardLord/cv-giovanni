import { DataLoader } from './DataLoader.js';
import { RendererContainer } from './RendererContainer.js';
import { ErrorRenderer } from '../renderers/ErrorRenderer.js';

/**
 * Main CV Application Controller
 * Follows Single Responsibility Principle (SRP) and Dependency Inversion Principle (DIP)
 */
export class CVApplication {
  constructor(
    dataLoader = new DataLoader(),
    rendererContainer = new RendererContainer(),
    documentLocalizer = null,
    i18n = null,
    errorRenderer = new ErrorRenderer()
  ) {
    this.dataLoader = dataLoader;
    this.rendererContainer = rendererContainer;
    this.documentLocalizer = documentLocalizer;
    this.i18n = i18n;
    this.errorRenderer = errorRenderer;
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
      this.currentData = data;
      this.root = root;
      if (this.documentLocalizer) this.documentLocalizer.apply(root, data);
      this.rendererContainer.renderAll(root, data);
      this.isInitialized = true;
      return data;
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
    this.errorRenderer.render(root, {
      title: this.i18n ? this.i18n.t('errors.loadingTitle') : 'Error loading CV',
      message: error.message,
      hint: this.i18n ? this.i18n.t('errors.loadingHint') : 'Please check the console for more details.'
    });
  }

  /**
   * Get application status
   * @returns {boolean} True if initialized successfully
   */
  getStatus() {
    return this.isInitialized;
  }
}

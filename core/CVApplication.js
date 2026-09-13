import { DataLoader } from './DataLoader.js';
import { CvDocument } from '../domain/CvDocument.js';
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
    errorRenderer = new ErrorRenderer(),
    documentFactory = (data) => new CvDocument(data)
  ) {
    this.dataLoader = dataLoader;
    this.rendererContainer = rendererContainer;
    this.documentLocalizer = documentLocalizer;
    this.i18n = i18n;
    this.errorRenderer = errorRenderer;
    this.documentFactory = documentFactory;
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
      // Every part of the page reads the model, as the PDF, the cover letter and the audits do: a default
      // or a renamed key added to CvDocument reaches the page and the PDF alike (#81). The profile itself
      // is returned, because the PDF exporter builds its own model from it.
      const cv = this.documentFactory(data);
      if (this.documentLocalizer) this.documentLocalizer.apply(root, cv);
      this.rendererContainer.renderAll(root, cv);
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
      hint: this.i18n
        ? this.i18n.t('errors.loadingHint')
        : 'Please check the console for more details.'
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

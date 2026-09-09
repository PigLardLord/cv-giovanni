/** Output port for turning a logical PDF definition into bytes. */
export class PdfRenderer {
  async render(_definition) {
    throw new Error('PdfRenderer.render must be implemented');
  }
}

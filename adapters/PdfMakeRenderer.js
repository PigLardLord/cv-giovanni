import { PdfRenderer } from '../boundaries/PdfRenderer.js';

export class PdfMakeRenderer extends PdfRenderer {
  constructor(pdfMake) {
    super();
    this.pdfMake = pdfMake;
  }

  async render(definition) {
    if (!this.pdfMake?.createPdf) throw new Error('PDF engine is unavailable');
    return new Promise((resolve) => this.pdfMake.createPdf(definition).getBuffer(resolve));
  }
}

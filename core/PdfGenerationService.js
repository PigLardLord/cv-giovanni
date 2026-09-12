export class PdfGenerationService {
  constructor({ composer, renderer, writer }) {
    this.composer = composer;
    this.renderer = renderer;
    this.writer = writer;
  }

  async generate(data, options) {
    const definition = this.composer.buildDocument(data, options);
    const bytes = await this.renderer.render(definition);
    const filename = this.composer.filename(data, options);
    await this.writer.write(filename, bytes);
    return { filename, bytes: bytes.length };
  }
}

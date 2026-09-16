import { CvDocument } from '../domain/CvDocument.js';
import { CvFiles } from './CvFiles.js';
import { PageFormat } from '../domain/PageFormat.js';
import { LayoutThemeRegistry } from '../adapters/LayoutThemeRegistry.js';
import { PdfDesignSystem } from '../adapters/PdfDesignSystem.js';
import { PdfLayout } from '../adapters/PdfLayout.js';

export class PdfExporter {
  constructor(_renderer = null, i18n = null, dependencies = {}) {
    this.i18n = i18n;
    this.documentFactory = dependencies.documentFactory || ((data) => new CvDocument(data));
    this.pageFormats = dependencies.pageFormats || new PageFormat();
    this.themes = dependencies.themes || new LayoutThemeRegistry();
    this.designSystem = dependencies.designSystem || new PdfDesignSystem();
    this.layout = dependencies.layout || new PdfLayout();
    this.files = new CvFiles({ documentFactory: this.documentFactory });
  }

  // The naming rules live in `CvFiles`, which the page imports without this module's composer (#145).
  filename(data, options) {
    return this.files.filename(data, options);
  }

  downloadName(data) {
    return this.files.downloadName(data);
  }

  isAvailable(generated, data, options) {
    return this.files.isAvailable(generated, data, options);
  }

  filePath(data, options) {
    return this.files.filePath(data, options);
  }

  buildDocument(data, options = {}) {
    if (typeof options === 'string') options = { layout: options };
    const { layout = 'spotlight', pageSize = 'A4', colorMode = 'color', locale = 'en' } = options;
    const model = this.documentFactory(data);
    const format = this.pageFormats.resolve(pageSize);
    const theme = this.themes.resolve(layout, colorMode);
    const t = (key) => this.i18n?.t(key) || key;
    const typography = this.designSystem.resolve(theme);
    return this.layout.compose(model, {
      layout,
      format,
      theme,
      typography,
      t,
      locale
    });
  }
}

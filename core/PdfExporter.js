import { CvDocument } from '../domain/CvDocument.js';
import { fileWords, nameSlug } from './FileNaming.js';
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
  }

  /**
   * The file the generator writes for a combination, named after the candidate the profile describes.
   * @param {object} data - The profile
   * @param {object} options - Profile, locale, layout, and for a QA variant its paper and colour
   * @returns {string} The filename
   */
  filename(
    data,
    {
      profile = 'general',
      locale = 'en',
      layout = 'spotlight',
      pageSize = 'A4',
      colorMode = 'color',
      variant = false
    } = {}
  ) {
    const suffix = variant ? `-${pageSize.toLowerCase()}-${colorMode}` : '';
    const name = nameSlug(this.documentFactory(data).identity.name);
    return `${name}-${profile}-${locale}-${layout}${suffix}.pdf`;
  }

  /** The name the recruiter's inbox receives: the person and the role, no build vocabulary. */
  downloadName({ name = '', title = '' } = {}) {
    return `${[...fileWords(name), ...fileWords(title), 'CV'].join('-')}.pdf`;
  }

  /**
   * Whether a download exists for this combination.
   *
   * The naming rule can name a file for any combination; only the generator knows which it
   * actually wrote. An absent or malformed manifest means nothing is available — the honest
   * reading, because the alternative offers every download and fails on all of them.
   * @param {string[]} generated - filenames the generator reported
   * @param {object} data - The profile the page rendered; none when it failed to load
   * @param {object} options - Profile, locale and layout
   */
  isAvailable(generated, data, options = {}) {
    if (!Array.isArray(generated) || !data) return false;
    // A profile without a name has no file to offer. Throwing here would stop the page mid-script.
    if (!fileWords(this.documentFactory(data).identity.name).length) return false;
    return generated.includes(this.filename(data, options));
  }

  filePath(data, options = {}) {
    return `generated/${this.filename(data, options)}`;
  }

  buildDocument(data, options = {}) {
    if (typeof options === 'string') options = { layout: options };
    const { layout = 'spotlight', pageSize = 'A4', colorMode = 'color' } = options;
    const model = this.documentFactory(data);
    const format = this.pageFormats.resolve(pageSize);
    const theme = this.themes.resolve(layout, colorMode);
    const t = (key) => this.i18n?.t(key) || key;
    const typography = this.designSystem.resolve(theme);
    return this.layout.compose(model, { layout, format, theme, typography, t });
  }
}

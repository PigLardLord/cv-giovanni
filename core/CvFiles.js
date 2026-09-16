import { CvDocument } from '../domain/CvDocument.js';
import { fileWords, nameSlug } from './FileNaming.js';

/**
 * The files a CV is delivered as: what the generator names them, what the recruiter's inbox calls
 * them, and whether one exists for a combination.
 *
 * The page needs these rules and nothing of how a PDF is composed, so they live apart from
 * `PdfExporter`, which imports the composer (#145).
 */
export class CvFiles {
  constructor({ documentFactory = (data) => new CvDocument(data) } = {}) {
    this.documentFactory = documentFactory;
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

  /**
   * The file a cover letter is printed to, beside the CV of the same layout (#151).
   *
   * `-cover` rather than `-letter`, as pdfmake named it: the print and ATS audits tell a letter from a CV by it,
   * and it cannot be read as a paper size.
   * @param {object} data - The profile, which names the file after the candidate
   * @param {{ profile?: string, locale?: string, layout?: string }} options - The combination it accompanies
   * @returns {string} The filename
   */
  letterFilename(data, { profile = 'general', locale = 'en', layout = 'spotlight' } = {}) {
    const name = nameSlug(this.documentFactory(data).identity.name);
    return `${name}-${profile}-${locale}-${layout}-cover.pdf`;
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
}

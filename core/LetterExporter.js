import { CoverLetter } from '../domain/CoverLetter.js';
import { CvDocument } from '../domain/CvDocument.js';
import { PageFormat } from '../domain/PageFormat.js';
import { LayoutThemeRegistry } from '../adapters/LayoutThemeRegistry.js';
import { PdfDesignSystem } from '../adapters/PdfDesignSystem.js';
import { LetterLayout } from '../adapters/LetterLayout.js';

/**
 * The cover letter's half of the export path.
 *
 * Deliberately the same two-method shape as `PdfExporter` — `buildDocument` and `filename` —
 * so `PdfGenerationService` drives both without knowing which it holds. A second service for
 * a second document would have been a copy of the first with one word changed.
 *
 * It resolves the theme from the CV layout it accompanies, because the pair travels together:
 * the letter is the first page a reader opens and the CV is the second, and two typefaces
 * across those two pages read as two people.
 */
export class LetterExporter {
  constructor(_renderer = null, i18n = null, dependencies = {}) {
    this.i18n = i18n;
    this.pageFormats = dependencies.pageFormats || new PageFormat();
    this.themes = dependencies.themes || new LayoutThemeRegistry();
    this.designSystem = dependencies.designSystem || new PdfDesignSystem();
    this.layout = dependencies.layout || new LetterLayout();
  }

  /**
   * The `-cover` in the name is load-bearing, not cosmetic — and it is `-cover` rather than
   * `-letter` because the paper size LETTER already owns that word: a cover letter on LETTER
   * paper would have been `…-letter-letter-color.pdf`, and every check that told the two
   * apart would have been a regex nobody could read twice.
   *
   * `audit-ats` reads every PDF beside the CV and would parse this one as a résumé — a
   * one-page letter has no headings, no chronology and no skills, so it would report a failed
   * segmentation and trip two floors on a perfectly good letter. A false failure is worse
   * than no check, because it teaches whoever sees it to ignore the exit code.
   */
  filename({
    profile = 'general',
    locale = 'en',
    layout = 'spotlight',
    pageSize = 'A4',
    colorMode = 'color',
    variant = false
  } = {}) {
    const suffix = variant ? `-${pageSize.toLowerCase()}-${colorMode}` : '';
    return `giovanni-trovato-${profile}-${locale}-${layout}-cover${suffix}.pdf`;
  }

  /** True when a profile carries a letter at all. The published CV does not. */
  static has(data) {
    return Boolean(data && data.letter && Object.keys(data.letter).length);
  }

  buildDocument(data, options = {}) {
    if (typeof options === 'string') options = { layout: options };
    const { layout = 'spotlight', pageSize = 'A4', colorMode = 'color', locale = 'en' } = options;
    const letter = new CoverLetter(data.letter);
    const { identity } = new CvDocument(data);
    const format = this.pageFormats.resolve(pageSize);
    const theme = this.themes.resolve(layout, colorMode);
    const t = (key) => this.i18n?.t(key) || key;

    return this.layout.compose(letter, {
      identity,
      format,
      theme,
      typography: this.designSystem.resolve(theme),
      t,
      locale
    });
  }
}

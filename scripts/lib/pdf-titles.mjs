import { LetterContent } from '../../core/LetterContent.js';
import { CvDocument } from '../../domain/CvDocument.js';

/**
 * The title a printed PDF carries, as `pdfinfo` reports it; null when it carries none. Chrome writes the page's
 * `<title>` there, and a viewer's tab, an email's preview and a screen reader's list of documents show it (#324, #340).
 * @param {string} info - What `pdfinfo` printed
 * @returns {string|null} The title
 */
export function pdfTitle(info) {
  return /^Title:[ \t]*(.*)$/m.exec(String(info ?? ''))?.[1].trim() || null;
}

/**
 * The titles the page composes for a profile: the CV's from `meta.title`, as `DocumentLocalizer` writes it, and the
 * letter's as `LetterContent` writes it — null for a profile that carries no letter.
 * @param {object} profile - The profile printed
 * @param {{ t: (key: string, values?: object) => string, locale: string }} options - The catalogues, both namespaces,
 *   and the language
 * @returns {{ cv: string, letter: string|null }} Each document's title
 */
export function composedTitles(profile, { t, locale }) {
  const name = new CvDocument(profile).identity.name || '';
  return {
    cv: t('ui:meta.title', { name }),
    letter: LetterContent.has(profile) ? LetterContent.of(profile, { t, locale }).title : null
  };
}

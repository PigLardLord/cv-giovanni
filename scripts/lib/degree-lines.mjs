/**
 * A degree and its school, adjacent in the text a parser reads, as the print audit checks them.
 *
 * The page writes a degree, then its school and period: "Degree School (period)", which the PDF pdfmake composed wrote
 * "Degree School · period". A degree that states its credits writes them after its name, "Degree (60 ECTS)" (#48), so
 * between the degree and its school the check expects exactly those words — the catalogue's, with the count as the CV's
 * language writes numbers — and nothing when the degree states none. Scope that did not print, or printed in other
 * words, is a degree that did not reach the paper as it was written.
 */

const escapeForRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{ degree: string, school: string, period?: string, credits?: number }} item - One degree of the profile
 * @param {{ credits: string, locale: string }} words - The catalogue's `education.credits`, and the CV's language
 * @returns {RegExp} What the degree, its scope, its school and its period read as, in text flattened to single spaces
 */
export function degreeBesideSchool(item, { credits, locale }) {
  const scope =
    item.credits === undefined || item.credits === null
      ? ''
      : `\\s+${escapeForRegExp(`(${credits.replace('{{count}}', new Intl.NumberFormat(locale).format(item.credits))})`)}`;
  // A degree with no period prints its school alone (#169), so nothing is asked after the school (#178).
  const period = typeof item.period === 'string' ? item.period.trim() : '';
  const when = period ? `\\s*[·(]\\s*${escapeForRegExp(period)}` : '';
  return new RegExp(
    `${escapeForRegExp(item.degree)}${scope}\\s+${escapeForRegExp(item.school)}${when}`
  );
}

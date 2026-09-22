/**
 * A degree and its school, adjacent in the text a parser reads, as the print audit checks them.
 *
 * The page writes a degree, then its school and period: "Degree School (period)", which the PDF pdfmake composed wrote
 * "Degree School · period". A degree that states its credits writes them after its name, "Degree (60 ECTS)" (#48), so
 * between the degree and its school the check expects exactly those words — the catalogue's, with the count as the CV's
 * language writes numbers — and nothing when the degree states none. Scope that did not print, or printed in other
 * words, is a degree that did not reach the paper as it was written.
 */

import { scopeText } from '../../domain/EntryLines.js';

const escapeForRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{ degree: string, school: string, period?: string, credits?: number }} item - One degree of the profile
 * @param {{ credits: (count: string) => string, locale: string }} words - How the CV writes a count of credits, as
 *   `creditWords` builds them: the scope is the one `scopeText` writes on the page (#215)
 * @returns {RegExp} What the degree, its scope, its school and its period read as, in text flattened to single spaces
 */
export function degreeBesideSchool(item, words) {
  const written = scopeText(item, words);
  const scope = written ? `\\s+${escapeForRegExp(`(${written})`)}` : '';
  // A degree with no period prints its school alone (#169), so nothing is asked after the school (#178).
  const period = typeof item.period === 'string' ? item.period.trim() : '';
  const when = period ? `\\s*[·(]\\s*${escapeForRegExp(period)}` : '';
  return new RegExp(
    `${escapeForRegExp(item.degree)}${scope}\\s+${escapeForRegExp(item.school)}${when}`
  );
}

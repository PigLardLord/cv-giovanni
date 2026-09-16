/**
 * The lines a CV entry writes, and which separators they carry, from the fields the entry has (#169).
 *
 * A profile edited in the browser can leave out a role's location, a degree's period, or a certification's issuer or
 * year: the profile's shape does not require them. The renderers wrote the punctuation around each of those fields
 * whatever they held, so a role with no location read "Engineer at Acme," and a certification with no year ended in
 * "()". A separator is written only beside the part it introduces.
 *
 * A line is a list of pieces: a string is a separator, and `{ field, text }` is a field's value, which a renderer may
 * set in an element of its own. Framework-free, no DOM.
 */

/** A field's value as written, or '' when there is none: whitespace alone is none, and zero is a value. */
const valueOf = (value) => (value === null || value === undefined ? '' : String(value).trim());

/**
 * "Title at Company, City", and "Title at Company" when the role names no city.
 * @param {{ title?: string, company?: string, location?: string }} role - One role of the experience
 * @param {string} at - The locale's word between the title and the employer
 * @returns {(string|{ field: string, text: string })[]} The header's pieces
 */
export function roleHeader({ title, company, location }, at) {
  const place = valueOf(location);
  return [
    { field: 'title', text: valueOf(title) },
    ` ${at} `,
    { field: 'company', text: valueOf(company) },
    ...(place ? [', ', { field: 'location', text: place }] : [])
  ];
}

/**
 * "School (period)", and the school alone when the degree names no period.
 * @param {{ school?: string, period?: string }} degree - One degree of the education
 * @returns {(string|{ field: string, text: string })[]} The line's pieces
 */
export function schoolLine({ school, period }) {
  const when = valueOf(period);
  return [
    { field: 'school', text: valueOf(school) },
    ...(when ? [' ', { field: 'period', text: `(${when})` }] : [])
  ];
}

/**
 * A degree's scope in the CV's words, "60 ECTS", or '' when it states none (#48).
 *
 * Only a count of credits is a scope: a whole number above zero. A count nobody can read reads as nothing, never as a
 * guess. `Intl` writes the number in the CV's language; the words around it are the caller's, which has the
 * catalogue, and a caller that gives none gets no bare number.
 * @param {{ credits?: number }} degree - One degree of the education
 * @param {{ credits?: (count: string) => string, locale?: string }} [words] - How the CV writes a count of credits,
 *   handed the count as its language writes it
 * @returns {string} The scope, or ''
 */
export function scopeText({ credits }, { credits: write, locale = 'en' } = {}) {
  if (!Number.isInteger(credits) || credits <= 0 || typeof write !== 'function') return '';
  return valueOf(write(new Intl.NumberFormat(locale).format(credits)));
}

/**
 * "Degree (60 ECTS)", and the degree alone when it states no scope. A Master's programme a German reader would
 * otherwise take for the Bologna second cycle states its credits after its name (#48), where they cost no printed
 * line and leave the school's line, which parsers read for the school and the period, as it was.
 * @param {{ degree?: string, credits?: number }} degree - One degree of the education
 * @param {{ credits?: (count: string) => string, locale?: string }} [words] - As `scopeText` takes them
 * @returns {(string|{ field: string, text: string })[]} The line's pieces
 */
export function degreeLine(degree, words = {}) {
  const scope = scopeText(degree, words);
  return [
    { field: 'degree', text: valueOf(degree.degree) },
    ...(scope ? [' ', { field: 'credits', text: `(${scope})` }] : [])
  ];
}

/**
 * What follows a certification's name: " – issuer" and " (year)", each only when the certification has it.
 * @param {{ issuer?: string, year?: number|string }} certification - One certification
 * @returns {string[]} The pieces after the name
 */
export function certificationLine({ issuer, year }) {
  const by = valueOf(issuer);
  const when = valueOf(year);
  return [...(by ? [` – ${by}`] : []), ...(when ? [` (${when})`] : [])];
}

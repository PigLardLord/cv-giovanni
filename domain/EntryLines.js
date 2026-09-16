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
 * What follows a certification's name: " – issuer" and " (year)", each only when the certification has it.
 * @param {{ issuer?: string, year?: number|string }} certification - One certification
 * @returns {string[]} The pieces after the name
 */
export function certificationLine({ issuer, year }) {
  const by = valueOf(issuer);
  const when = valueOf(year);
  return [...(by ? [` – ${by}`] : []), ...(when ? [` (${when})`] : [])];
}

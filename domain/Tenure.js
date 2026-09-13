/**
 * How long a role lasted, in the reader's words (#55).
 *
 * `Intl` owns durations (AGENTS.md). `Intl.DurationFormat` writes "8 years, 2 months" in English and "3 Jahre"
 * in German, and leaves out a unit that is zero. A length nobody can know — a period written to the year, a
 * running role in a profile that names no month to count to — reads as nothing, never as a guess.
 * @param {number|null} months - Whole months, both ends counted
 * @param {string} locale - The CV's language
 * @returns {string} The length, or '' when there is none to give
 */
export function tenureText(months, locale = 'en') {
  if (!Number.isInteger(months) || months <= 0 || typeof Intl.DurationFormat !== 'function')
    return '';
  return new Intl.DurationFormat(locale, { style: 'long' }).format({
    years: Math.floor(months / 12),
    months: months % 12
  });
}

/**
 * A role's period followed by its length, as the page and the PDF both write it: `August 2018 – Present
 * (8 years, 2 months)`. The profile writes the dates; the length is counted from them.
 * @param {import('./CvDocument.js').CvDocument} cv - The model, which knows the month lengths are counted to
 * @param {{ period?: string }} role - One entry of `cv.experience`
 * @param {string} locale - The CV's language
 * @returns {string} The period, with its length when there is one
 */
export function periodText(cv, role, locale = 'en') {
  const tenure = tenureText(cv.monthsIn(role), locale);
  return tenure ? `${role.period} (${tenure})` : role.period;
}

/** Where each language's dates are written, with a region, since a bare `en` writes American dates. */
const DATE_LOCALES = { en: 'en-GB', de: 'de-DE' };

/**
 * The locale a date is written in. The CV is written in British English for European readers, so English
 * dates read "13 September 2026", never the American "September 13, 2026" (#55).
 * @param {string} locale - The CV's language
 * @returns {string} A region-bearing locale for `Intl.DateTimeFormat`
 */
export function dateLocale(locale = 'en') {
  return DATE_LOCALES[locale] || locale;
}

/**
 * Whether the month lengths are counted to lies after the day a document is made: lengths nobody can check
 * yet, or, with a typo like 2029-09, false ones.
 * @param {{year: number, month: number}|null} asOf - The month from the profile
 * @param {Date} day - The day the document is made
 * @returns {boolean} True when `asOf` is a later month than `day`'s
 */
export function countedPast(asOf, day) {
  if (!asOf) return false;
  return asOf.year * 12 + asOf.month > day.getFullYear() * 12 + day.getMonth() + 1;
}

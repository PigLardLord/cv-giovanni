import { DateRange } from './DateRange.js';

/**
 * The spans of time a profile's sentences state, and whether each will stay true as the calendar moves (#104).
 *
 * #55 stopped typing lengths into the periods, because a typed length is wrong the month after it is written, and
 * counts them from the dates instead. A sentence can make the same mistake: "six years owning an enterprise MDM
 * client" agreed with the dates the day it was written and contradicted them the day the anniversary passed. So a
 * sentence may state time in two shapes only:
 * - a floor — "11+ years", "über 11 Jahren" — which only grows truer as time passes;
 * - an exact count tied to a role that has ended — "8 of them at Cortado", "davon 8 bei Cortado" — when that role's
 *   dates agree with it. A role that has ended stops counting, so the count stays true for good.
 * Any other exact count of years or months is a span the calendar will overtake.
 */

/** The counts English and German write in words, as far as a CV ever writes one. */
const WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  ein: 1,
  eins: 1,
  einem: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12
});
const COUNT = `(\\d+|${Object.keys(WORDS).join('|')})`;
/** A word's edges in any script: `\\b` is ASCII even under the `u` flag, and sees no edge before the "ü" of "über". */
const START = '(?<![\\p{L}\\p{N}])';
const END = '(?![\\p{L}\\p{N}])';
const UNIT = '(years?|months?|Jahre|Jahren|Jahr|Monate|Monaten|Monat)';

/** "11+ years", "über 11 Jahren", "mehr als 3 Monate": a floor, which only grows truer. */
const FLOOR = new RegExp(
  `\\d+\\+\\s*${UNIT}|${START}(?:über|mehr als)\\s+${COUNT}\\s+${UNIT}`,
  'giu'
);
/** "8 of them at Cortado", "davon 8 bei Cortado": a count tied to an employer, checked against its dates. */
const TIED = new RegExp(
  `${START}${COUNT} of them at ([^.,;]+)|${START}davon ${COUNT} bei ([^.,;]+)`,
  'giu'
);
/** Any other count of years or months. */
const EXACT = new RegExp(`${START}${COUNT}\\s+${UNIT}${END}`, 'giu');

const number = (text) => WORDS[text.toLowerCase()] ?? Number(text);

/**
 * Every sentence in a profile that states a span of time the calendar will overtake, or that its dates contradict.
 * @param {object} profile - A profile, as `profiles/<profile>/<locale>.json` holds it
 * @returns {{ field: string, said: string, why: string }[]} Each such span, where it is, and why it will not hold
 */
export function driftingSpans(profile) {
  const roles = Array.isArray(profile?.relevant_experience) ? profile.relevant_experience : [];
  const found = [];
  for (const { field, text } of sentences(profile)) {
    const covered = [];
    for (const match of text.matchAll(FLOOR))
      covered.push([match.index, match.index + match[0].length]);
    for (const match of text.matchAll(TIED)) {
      covered.push([match.index, match.index + match[0].length]);
      const said = match[0].trim();
      const count = number(match[1] ?? match[3]);
      const employer = (match[2] ?? match[4]).trim();
      const why = againstTheDates(count, employer, roles);
      if (why) found.push({ field, said, why });
    }
    for (const match of text.matchAll(EXACT)) {
      const inside = covered.some(([from, to]) => match.index >= from && match.index < to);
      if (inside) continue;
      found.push({
        field,
        said: match[0],
        why:
          'an exact span with no ended role behind it: the calendar will overtake it. Write a floor ("11+ years"), ' +
          'the start ("since 2020"), or tie it to a role that has ended.'
      });
    }
  }
  return found;
}

/** Why a count tied to an employer does not hold, or null when the employer's ended role agrees with it. */
function againstTheDates(count, employer, roles) {
  const role = roles.find((candidate) => candidate?.company === employer);
  if (!role) return `names no role at ${employer} whose dates could bear it out`;
  const range = DateRange.parse(role.period);
  if (!range) return `${employer}'s period, "${role.period}", has no dates to count`;
  if (range.end === 'present') {
    return `counts a role that is still running, so the calendar will overtake it`;
  }
  const months = range.monthsAt(null);
  if (months === null)
    return `${employer}'s period, "${role.period}", is written to the year, too coarse to count`;
  const years = Math.floor(months / 12);
  return years === count ? null : `says ${count}, and ${employer}'s dates say ${years}`;
}

/** Every string a profile writes as prose, with where it is: a period is a date range, not a sentence. */
function* sentences(value, field = '') {
  if (typeof value === 'string') {
    yield { field, text: value };
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* sentences(item, `${field}[${index}]`);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'period' || key === 'asOf') continue;
      yield* sentences(item, field ? `${field}.${key}` : key);
    }
  }
}

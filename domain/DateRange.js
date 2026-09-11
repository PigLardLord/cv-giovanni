import { fold } from './fold.js';

/**
 * Month names, per language, as data.
 *
 * German and Italian are on the roadmap and more will follow, so a language is added by
 * adding entries here and nowhere else — the same rule the section lexicon follows. Both
 * the full name and the abbreviation a CV actually writes are listed; nothing is derived by
 * truncation, because `Mär`, `mag` and `Sept` are not the first three letters of anything.
 */
export const MONTHS = {
  en: {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sept: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12
  },
  de: {
    januar: 1,
    jan: 1,
    februar: 2,
    feb: 2,
    marz: 3,
    mar: 3,
    april: 4,
    apr: 4,
    mai: 5,
    juni: 6,
    jun: 6,
    juli: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    oktober: 10,
    okt: 10,
    november: 11,
    nov: 11,
    dezember: 12,
    dez: 12
  },
  it: {
    gennaio: 1,
    gen: 1,
    febbraio: 2,
    feb: 2,
    marzo: 3,
    mar: 3,
    aprile: 4,
    apr: 4,
    maggio: 5,
    mag: 5,
    giugno: 6,
    giu: 6,
    luglio: 7,
    lug: 7,
    agosto: 8,
    ago: 8,
    settembre: 9,
    set: 9,
    ottobre: 10,
    ott: 10,
    novembre: 11,
    nov: 11,
    dicembre: 12,
    dic: 12
  }
};

/** However a CV says "and it has not ended". */
const PRESENT = [
  'present',
  'now',
  'current',
  'ongoing',
  'heute',
  'aktuell',
  'laufend',
  'oggi',
  'presente',
  'attuale',
  'in corso'
];

/** However a CV says "it began, and it has not ended". */
const SINCE = ['since', 'seit', 'dal', 'da'];

const SEPARATOR = /\s*(?:[–—‒~-]|\bto\b|\bbis\b|\bal\b)\s*/;

const MONTH_INDEX = Object.fromEntries(
  Object.values(MONTHS).flatMap((names) =>
    Object.entries(names).map(([name, number]) => [fold(name), number])
  )
);

/**
 * One period of time, as a CV writes it.
 *
 * Dates are how a reader — and a parser — reconstructs a career, so what matters here is
 * as much what it refuses as what it accepts. A guessed date produces a history that is
 * wrong in a way nobody can see.
 */
export class DateRange {
  constructor({ start, end, precision, notation, trailing, raw }) {
    this.start = start;
    this.end = end;
    this.precision = precision;
    this.notation = notation;
    this.trailing = trailing;
    this.raw = raw;
  }

  /**
   * Read one range, or return null when it is not a range or not decidable.
   * @param {string} text - The period as written
   * @returns {DateRange|null} The range, or null
   */
  static parse(text) {
    if (typeof text !== 'string') return null;
    const raw = text.trim().replace(/\s+/g, ' ');
    if (!raw) return null;

    // `03/04/2021` is the third of April or the fourth of March depending on the reader, and
    // no context in a CV decides it. Refusing is the only honest answer.
    if (/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/.test(raw)) return null;

    const trailingMatch = raw.match(
      /\s(\([^)]*\)|\d+\s*(?:years?|yrs?|months?|mos?|Jahre?|Monate?|anni|mesi)\b.*)$/i
    );
    const trailing = trailingMatch ? trailingMatch[1].trim() : '';
    const body = trailingMatch ? raw.slice(0, trailingMatch.index).trim() : raw;

    const sinceMatch = new RegExp(`^(?:${SINCE.join('|')})\\s+(.*)$`, 'i').exec(body);
    // A single point is a range of one: a CV that writes `2015` or `May 2015` as a period
    // means that year, or that month. Refusing it would drop the role rather than the date,
    // and a missing role is a bigger lie than a short one.
    const split = body.split(SEPARATOR);
    const parts = sinceMatch
      ? [sinceMatch[1], 'present']
      : split.length === 1
        ? [body, body]
        : split;
    if (parts.length !== 2) return null;

    const start = DateRange.point(parts[0]);
    const end = DateRange.point(parts[1]);
    if (!start || start === 'present' || !end) return null;

    const precision = start.month && (end === 'present' || end.month) ? 'month' : 'year';
    return new DateRange({
      start,
      end,
      precision,
      notation: DateRange.notation(parts[0]),
      trailing,
      raw
    });
  }

  /**
   * How a point is written: a named month, a numeric one, or a bare year.
   *
   * This is the thing that varies between documents and defeats extraction — not whether an
   * end is open. `March 2021 – Present` and `March 2021 – July 2022` are one notation.
   * @param {string} text - One end, as written
   * @returns {string} `named`, `numeric`, `year` or `other`
   */
  static notation(text) {
    const folded = fold(String(text || ''));
    if (/^\d{1,2}[./]\d{4}$/.test(folded)) return 'numeric';
    if (/^\d{4}$/.test(folded)) return 'year';
    const named = /^([a-z]+)\.?\s+\d{4}$/.exec(folded);
    return named && MONTH_INDEX[named[1]] ? 'named' : 'other';
  }

  /**
   * Read one end of a range: a year, a month and a year, or the present.
   * @param {string} text - One end, as written
   * @returns {{year: number, month: number|null}|'present'|null} The point
   */
  static point(text) {
    const folded = fold(String(text || ''));
    if (!folded) return null;
    if (PRESENT.includes(folded)) return 'present';

    const numeric = /^(\d{1,2})[./](\d{4})$/.exec(folded);
    if (numeric) {
      const month = Number(numeric[1]);
      return month >= 1 && month <= 12 ? { year: Number(numeric[2]), month } : null;
    }

    const named = /^([a-z]+)\.?\s+(\d{4})$/.exec(folded);
    if (named && MONTH_INDEX[named[1]]) {
      return { year: Number(named[2]), month: MONTH_INDEX[named[1]] };
    }

    const year = /^(\d{4})$/.exec(folded);
    return year ? { year: Number(year[1]), month: null } : null;
  }

  /** Months covered, inclusive of both ends — the tenure a CV means by "2015 – 2018". */
  get months() {
    return this.monthsAt(null);
  }

  /**
   * Months covered, with an explicit today for an open range.
   *
   * The clock is passed in rather than read: a duration that changes between two runs of
   * the same audit is a duration nobody can assert on.
   * @param {{year: number, month: number}|null} today - What "present" means here
   * @returns {number|null} Months, or null when the end is open and no today was given
   */
  monthsAt(today) {
    // A year-precision range claims no duration. "2015 – 2018" is anywhere from twenty-five
    // months to forty-eight, and picking one would be claiming precision the data does not
    // have — the rule this project applies to skill levels, applied to time.
    if (this.precision !== 'month') return null;
    const end = this.end === 'present' ? today : this.end;
    if (!end || !end.month) return null;
    return (end.year - this.start.year) * 12 + (end.month - this.start.month) + 1;
  }

  /**
   * Months between the end of one range and the start of the next. Negative is an overlap.
   * @param {DateRange} earlier - The range that ended
   * @param {DateRange} later - The range that began
   * @returns {number|null} Months, or null when either end is open
   */
  static gap(earlier, later) {
    if (!earlier || !later || earlier.end === 'present') return null;
    const from = earlier.end.year * 12 + (earlier.end.month || 12);
    const to = later.start.year * 12 + (later.start.month || 1);
    return to - from;
  }

  /**
   * How many distinct shapes a set of ranges is written in.
   *
   * More than one is a finding: mixed formats are the documented killer of date extraction,
   * and a document that writes `March 2021`, `03/2021` and `2021` defeats every parser that
   * copes with one of them.
   * @param {string[]} texts - The periods as written
   * @returns {number} Distinct shapes
   */
  static shapes(texts = []) {
    const notations = texts
      .map((text) => DateRange.parse(text))
      .filter(Boolean)
      .map((range) => range.notation);
    return new Set(notations).size;
  }
}

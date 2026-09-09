import { DateRange, MONTHS } from '../domain/DateRange.js';

const parse = (text) => DateRange.parse(text);

describe('DateRange.parse', () => {
  test('a month and a year at each end', () => {
    const range = parse('September 2015 – July 2018');

    expect(range.start).toEqual({ year: 2015, month: 9 });
    expect(range.end).toEqual({ year: 2018, month: 7 });
    expect(range.precision).toBe('month');
  });

  test('an open end is the present, however it is written', () => {
    for (const text of ['August 2018 – Present', 'August 2018 - heute', 'agosto 2018 — oggi']) {
      expect(parse(text).end).toBe('present');
    }
  });

  test('an open start reads as one', () => {
    const range = parse('seit August 2018');

    expect(range.start).toEqual({ year: 2018, month: 8 });
    expect(range.end).toBe('present');
  });

  test('years alone are years alone, not months invented', () => {
    const range = parse('2015 – 2018');

    expect(range.start).toEqual({ year: 2015, month: null });
    expect(range.precision).toBe('year');
  });

  test('numeric month and year, in either notation', () => {
    expect(parse('08/2018 – 07/2019').start).toEqual({ year: 2018, month: 8 });
    expect(parse('05.2015 – 08.2015').end).toEqual({ year: 2015, month: 8 });
  });

  test('what trails the range is kept, not parsed', () => {
    const range = parse('September 2015 – July 2018 (3 years)');

    expect(range.end).toEqual({ year: 2018, month: 7 });
    expect(range.trailing).toBe('(3 years)');
  });

  // The refusal that matters. 03/04/2021 is the third of April or the fourth of March
  // depending on where the reader is from, and no amount of context decides it. A parser
  // that guesses produces a career history that is wrong in a way nobody can see.
  test('refuses a day it cannot place', () => {
    for (const text of ['03/04/2021 – 05/06/2022', '3.4.2021 - 5.6.2022']) {
      expect(parse(text)).toBeNull();
    }
  });

  test('refuses what is not a range at all', () => {
    for (const text of ['', '   ', 'Berlin (remote)', 'Cortado Mobile Solutions', null]) {
      expect(parse(text)).toBeNull();
    }
  });

  test('keeps the text it was given', () => {
    expect(parse('  August 2018 – Present  ').raw).toBe('August 2018 – Present');
  });
});

describe('the months are data, not code', () => {
  // German and Italian are filed; more will follow. Adding a language must mean adding
  // entries, never editing the parser — the same rule the section lexicon follows.
  test.each([
    ['en', 'March 2021', 3],
    ['de', 'März 2021', 3],
    ['de', 'Mär 2021', 3],
    ['it', 'marzo 2021', 3],
    ['it', 'mag 2021', 5],
    ['en', 'Sept 2021', 9]
  ])('%s reads %s', (_language, text, month) => {
    expect(parse(`${text} – Present`).start.month).toBe(month);
  });

  test('every supported language names twelve months', () => {
    for (const [language, names] of Object.entries(MONTHS)) {
      expect(new Set(Object.values(names)).size).toBe(12);
      expect(language).toMatch(/^[a-z]{2}$/);
    }
  });
});

describe('what a career is made of', () => {
  test('a range knows how long it lasted, both ends counted', () => {
    expect(parse('September 2015 – July 2018').months).toBe(35);
  });

  // "2015 – 2018" is anywhere from twenty-five months to forty-eight. Returning one number
  // would be claiming a precision the data does not have.
  test('a year-precision range claims no duration', () => {
    expect(parse('2015 – 2018').months).toBeNull();
    expect(parse('2015 – 2018').precision).toBe('year');
  });

  test('an open range is measured against a given today, never against the clock', () => {
    expect(parse('August 2018 – Present').monthsAt({ year: 2026, month: 9 })).toBe(98);
    expect(parse('August 2018 – Present').months).toBeNull();
  });

  test('the gap between two roles is months, and a negative gap is an overlap', () => {
    const older = parse('September 2015 – July 2018');
    const newer = parse('August 2018 – Present');

    expect(DateRange.gap(older, newer)).toBe(1);
    expect(DateRange.gap(parse('January 2016 – December 2018'), parse('June 2018 – March 2020'))).toBe(-6);
    // A range that has not ended cannot be the earlier half of a gap.
    expect(DateRange.gap(newer, older)).toBeNull();
  });

  // Mixed formats are the documented killer of date extraction: a parser that copes with
  // one shape per document copes with none when a document uses three.
  test('counts how many shapes one document uses', () => {
    expect(DateRange.shapes(['August 2018 – Present', 'September 2015 – July 2018'])).toBe(1);
    expect(DateRange.shapes(['March 2021 – Present', 'Mär 2021 – heute'])).toBe(1);
    expect(DateRange.shapes(['August 2018 – Present', '08/2018 – 07/2019', '2015 – 2018'])).toBe(3);
  });
});

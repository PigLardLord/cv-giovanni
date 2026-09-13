import { countedPast, dateLocale, tenureText } from '../domain/Tenure.js';

// A duration belongs to Intl, never to a string typed into a period: the one typed there was wrong the
// month after it was written, which is why the current role had none (#55).
describe('how long a role lasted, in words', () => {
  test.each([
    [98, 'en', '8 years, 2 months'],
    [35, 'en', '2 years, 11 months'],
    [36, 'en', '3 years'],
    [4, 'en', '4 months'],
    [36, 'de', '3 Jahre']
  ])('%i months in %s reads "%s"', (months, locale, text) => {
    expect(tenureText(months, locale)).toBe(text);
  });

  test('a length nobody can know reads as nothing', () => {
    expect(tenureText(null, 'en')).toBe('');
    expect(tenureText(0, 'en')).toBe('');
  });
});

// The CV is written in British English for European readers: its dates follow, "13 September 2026", never
// the American "September 13, 2026" a bare `en` gives (#55).
test('dates are written in a region-bearing locale', () => {
  expect(dateLocale('en')).toBe('en-GB');
  expect(dateLocale('de')).toBe('de-DE');
});

// A month after the day a document is made gives lengths nobody can check yet, and a typo like 2029-09 gives
// a false one.
test('a length counted past the day the document is made is caught', () => {
  const day = new Date(2026, 8, 13);

  expect(countedPast({ year: 2029, month: 9 }, day)).toBe(true);
  expect(countedPast({ year: 2026, month: 10 }, day)).toBe(true);
  expect(countedPast({ year: 2026, month: 9 }, day)).toBe(false);
  expect(countedPast({ year: 2026, month: 8 }, day)).toBe(false);
  expect(countedPast(null, day)).toBe(false);
});

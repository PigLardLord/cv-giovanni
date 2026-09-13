import { tenureText } from '../domain/Tenure.js';

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

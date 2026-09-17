import { DASH_GLYPHS, SEPARATOR_GLYPHS, periodEnds } from '../domain/Separators.js';

// Where a period may break is decided once, here: the page's roles and Nerd Mode's Swift file both read it, and the
// file needs it before any element exists, to know what to hold with a period's closing quote (#180, #219).
describe('the ends of a period', () => {
  test('are the first up to and with its dash, the space after the dash, and the second', () => {
    expect(periodEnds('September 2015 – July 2018')).toEqual({
      first: 'September 2015 –',
      space: ' ',
      second: 'July 2018'
    });
  });

  test('split at the first dash of either kind, with no space when the period writes none', () => {
    expect(periodEnds('2014—2016 – 2018')).toEqual({
      first: '2014—',
      space: '',
      second: '2016 – 2018'
    });
  });

  test('are none for a period with no dash, or no period', () => {
    expect(periodEnds('2009')).toBeNull();
    expect(periodEnds(undefined)).toBeNull();
  });
});

describe('the glyphs a line holds', () => {
  test('are the separators, of which the dashes a period breaks after are two', () => {
    expect(SEPARATOR_GLYPHS).toEqual(['·', '–', '—', '|']);
    expect(DASH_GLYPHS.every((dash) => SEPARATOR_GLYPHS.includes(dash))).toBe(true);
    expect(Object.isFrozen(SEPARATOR_GLYPHS) && Object.isFrozen(DASH_GLYPHS)).toBe(true);
  });
});

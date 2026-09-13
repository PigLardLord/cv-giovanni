import { LocaleResolver } from '../core/LocaleResolver.js';

describe('LocaleResolver', () => {
  const resolver = new LocaleResolver();

  test('gives URL language precedence over saved and browser preferences', () => {
    expect(
      resolver.resolve({
        search: '?lang=de',
        stored: 'en',
        browserLanguages: ['en-GB']
      })
    ).toBe('de');
  });

  test('normalizes BCP 47 language tags', () => {
    expect(resolver.normalize('en-GB')).toBe('en');
    expect(resolver.normalize('de-DE')).toBe('de');
  });

  test('uses saved preference before browser preference', () => {
    expect(resolver.resolve({ stored: 'de', browserLanguages: ['en-US'] })).toBe('de');
  });

  test('falls back to English for unsupported locales', () => {
    expect(resolver.resolve({ search: '?lang=fr', browserLanguages: ['fr-FR'] })).toBe('en');
  });
});

// A browser set to German opened the English-only CV and got an error page instead: the browser's language was
// resolved among every language the interface has, and the profile publishes one (#103). A language nobody put
// in the address is a guess, and a guess is taken only from the languages the profile publishes.
describe('a guessed language, against the languages the profile publishes', () => {
  const resolver = new LocaleResolver();

  test('a browser language the profile does not publish gives way to one it does', () => {
    expect(resolver.resolve({ browserLanguages: ['de-DE', 'de'], published: ['en'] })).toBe('en');
  });

  test('so does a saved preference', () => {
    expect(resolver.resolve({ stored: 'de', browserLanguages: ['de-DE'], published: ['en'] })).toBe(
      'en'
    );
  });

  test('the first guess the profile publishes wins, saved before browser', () => {
    const published = ['en', 'de'];

    expect(resolver.resolve({ stored: 'de', browserLanguages: ['en'], published })).toBe('de');
    expect(resolver.resolve({ browserLanguages: ['it-IT', 'de-DE', 'en'], published })).toBe('de');
  });

  test("with no match, the profile's own language, not a language it does not have", () => {
    expect(resolver.resolve({ browserLanguages: ['en-US'], published: ['de'] })).toBe('de');
  });

  // Asked for in the address, a language stays, so the refusal for a combination nobody publishes stays visible.
  test('a language named in the address is kept, published or not', () => {
    expect(
      resolver.resolve({ search: '?lang=de', browserLanguages: ['en'], published: ['en'] })
    ).toBe('de');
  });
});

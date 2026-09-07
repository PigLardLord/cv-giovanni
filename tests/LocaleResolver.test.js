import { LocaleResolver } from '../core/LocaleResolver.js';

describe('LocaleResolver', () => {
  const resolver = new LocaleResolver();

  test('gives URL language precedence over saved and browser preferences', () => {
    expect(resolver.resolve({
      search: '?lang=de', stored: 'en', browserLanguages: ['en-GB']
    })).toBe('de');
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

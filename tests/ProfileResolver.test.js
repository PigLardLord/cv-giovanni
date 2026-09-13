import { ProfileResolver } from '../core/ProfileResolver.js';

describe('ProfileResolver', () => {
  const manifest = {
    defaultProfile: 'general',
    profiles: {
      general: { locales: { en: 'profiles/general/en.json' } },
      ios: { locales: { en: 'profiles/ios/en.json', de: 'profiles/ios/de.json' } }
    }
  };
  const resolver = new ProfileResolver();

  test('resolves the default profile in the requested locale', () => {
    expect(resolver.resolve(manifest, { locale: 'en' })).toEqual({
      profile: 'general',
      locale: 'en',
      dataUrl: 'profiles/general/en.json'
    });
  });

  test('resolves a shareable profile query', () => {
    expect(resolver.resolve(manifest, { search: '?profile=ios', locale: 'de' })).toEqual({
      profile: 'ios',
      locale: 'de',
      dataUrl: 'profiles/ios/de.json'
    });
  });

  test('rejects unavailable locale combinations instead of mixing languages', () => {
    expect(() => resolver.resolve(manifest, { locale: 'de' })).toThrow(
      'Profile general is not available in de'
    );
  });

  test('rejects unknown and unsafe profile names', () => {
    expect(() => resolver.resolve(manifest, { search: '?profile=unknown', locale: 'en' })).toThrow(
      'Unknown CV profile: unknown'
    );
    expect(resolver.requestedProfile('?profile=../../secret')).toBeNull();
  });
});

// The languages a profile is published in decide which guessed language the page may take (#103).
describe('the languages a profile is published in', () => {
  const manifest = {
    defaultProfile: 'general',
    profiles: {
      general: { locales: { en: 'profiles/general/en.json' } },
      acme: { locales: { en: 'a', de: 'b' } }
    }
  };
  const resolver = new ProfileResolver();

  test("are the requested profile's, or the default profile's", () => {
    expect(resolver.publishedLocales(manifest, '')).toEqual(['en']);
    expect(resolver.publishedLocales(manifest, '?profile=acme')).toEqual(['en', 'de']);
  });

  test('are none for a profile the manifest does not list, which fails on its own', () => {
    expect(resolver.publishedLocales(manifest, '?profile=nobody')).toEqual([]);
    expect(resolver.publishedLocales(undefined, '')).toEqual([]);
  });
});

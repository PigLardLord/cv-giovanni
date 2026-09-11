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

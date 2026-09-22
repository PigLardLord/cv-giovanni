import { ProfileResolver, printedLayout } from '../core/ProfileResolver.js';

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
    expect(resolver.requestedProfile('?profile=-general')).toBeNull();
  });

  // A tailoring job's id begins with the date it arrived, and names the profile its CV is printed from (#303).
  test('takes a name that begins with a digit, as an application and a job may', () => {
    expect(resolver.requestedProfile('?profile=20260921-143205-a1b2c3')).toBe(
      '20260921-143205-a1b2c3'
    );
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

// The owner settled #231: Technical Profile is the CV's one layout and its one PDF, and every screen layout offers that
// file (#361). The manifest says which, and a manifest that prints a layout it does not list is refused, not guessed.
describe('the layout the CV is printed in', () => {
  test("is the manifest's pdf", () => {
    expect(printedLayout({ layouts: ['nerd', 'spotlight', 'technical'], pdf: 'technical' })).toBe(
      'technical'
    );
  });

  test.each([
    ['names none', { layouts: ['nerd', 'technical'] }],
    ['names a layout it does not list', { layouts: ['nerd', 'technical'], pdf: 'spotlight' }]
  ])('is refused when the manifest %s', (_, manifest) => {
    expect(() => printedLayout(manifest)).toThrow(/config\/cv-manifest\.json/);
  });

  test("is the repository's Technical Profile", async () => {
    const { readFileSync } = await import('node:fs');
    const manifest = JSON.parse(
      readFileSync(new URL('../config/cv-manifest.json', import.meta.url), 'utf8')
    );

    expect(printedLayout(manifest)).toBe('technical');
  });
});

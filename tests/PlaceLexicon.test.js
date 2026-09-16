import { PLACES, PlaceLexicon } from '../domain/PlaceLexicon.js';

describe('the city a location names, for the line that dates a letter', () => {
  test.each([
    ['Bad Liebenstein, Thuringia, Germany', 'Bad Liebenstein'],
    ['Bad Liebenstein, Thüringen, Deutschland', 'Bad Liebenstein'],
    ['Munich, Bavaria, Germany', 'Munich'],
    // Berlin is a state as well as a city: the first part is the city, whatever else it names.
    ['Berlin, Germany', 'Berlin'],
    ['Hamburg, Germany', 'Hamburg'],
    ['Bremen, Deutschland', 'Bremen'],
    ['Amburgo, Germania', 'Amburgo']
  ])('%s is dated from %s', (location, city) => {
    expect(PlaceLexicon.cityOf(location)).toBe(city);
  });

  // When a part after the first is not a region or a country the list knows, nothing tells a
  // city's region from a street and its city, so the location stays as written.
  test.each([
    'Bad Liebenstein',
    'Pisa, Tuscany, Italy',
    'Musterstraße 1, Bad Liebenstein, Germany',
    'Remote, Europe',
    // Found by the adversarial review: a country written first is not a city, and a first part with a
    // number in it is an address, even when every part after it is a place the lexicon knows.
    'Germany, Berlin',
    'Musterstraße 1, Berlin, Deutschland',
    // Found by the code review of #36's merge: a state named first is not a city, unless it is one of the three
    // that are cities as well (#122).
    'Thuringia, Germany',
    'Bavaria, Germany',
    'Sachsen, Deutschland',
    'Turingia, Germania',
    ''
  ])('"%s" comes back as written', (location) => {
    expect(PlaceLexicon.cityOf(location)).toBe(location);
  });
});

// German writes an umlaut as ae, oe or ue where it cannot type one, and a CV does: Thueringen, Oesterreich. The code
// review of #133 found such a state read as a city, and such a country not read at all (#137).
describe('a German place written without its umlauts, as German writes it', () => {
  const digraphs = (name) =>
    name.replace(
      /[äöüÄÖÜ]/g,
      (letter) => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' })[letter]
    );
  const umlauted = Object.values(PLACES)
    .flatMap((byLanguage) => Object.values(byLanguage).flat())
    .filter((name) => /[äöüÄÖÜ]/.test(name));

  test('the lexicon has names with umlauts to hold to this', () => {
    expect(umlauted).toEqual(
      expect.arrayContaining(['Thüringen', 'Österreich', 'Baden-Württemberg'])
    );
  });

  test.each(umlauted)('%s is known in its ae, oe or ue spelling too', (name) => {
    expect(PlaceLexicon.recognise(digraphs(name))).toEqual(PlaceLexicon.recognise(name));
  });

  test.each(['Thueringen, Germany', 'Baden-Wuerttemberg, Deutschland'])(
    '"%s" comes back as written, a state and not a city',
    (location) => {
      expect(PlaceLexicon.cityOf(location)).toBe(location);
    }
  );

  test('a city in a state spelt that way dates the letter, and a country spelt that way is a location', () => {
    expect(PlaceLexicon.cityOf('Bad Liebenstein, Thueringen, Deutschland')).toBe('Bad Liebenstein');
    expect(PlaceLexicon.locationIn('Wien, Oesterreich')).toBe('Wien, Oesterreich');
  });

  test('a word that is not an umlaut is left as it is', () => {
    expect(PlaceLexicon.recognise('Michael')).toBeNull();
  });
});

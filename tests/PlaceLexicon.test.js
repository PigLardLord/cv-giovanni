import { PlaceLexicon } from '../domain/PlaceLexicon.js';

describe('the city a location names, for the line that dates a letter', () => {
  test.each([
    ['Bad Liebenstein, Thuringia, Germany', 'Bad Liebenstein'],
    ['Bad Liebenstein, Thüringen, Deutschland', 'Bad Liebenstein'],
    ['Munich, Bavaria, Germany', 'Munich'],
    // Berlin is a state as well as a city: the first part is the city, whatever else it names.
    ['Berlin, Germany', 'Berlin']
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
    ''
  ])('"%s" comes back as written', (location) => {
    expect(PlaceLexicon.cityOf(location)).toBe(location);
  });
});

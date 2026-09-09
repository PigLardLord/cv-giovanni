import { fold } from './fold.js';

/**
 * Places a CV's location line is likely to end with, per language.
 *
 * A location is only recognised when its last part is a place this list knows. That is a
 * deliberate limit rather than a gap: `Cortado Mobile Solutions · Berlin (remote)` and
 * `Bad Liebenstein, Thuringia, Germany` are the same shape to a regex, and guessing which
 * one is an address puts a company name in the location field of a parsed record.
 *
 * The list is small on purpose. It grows when a CV needs it, in the same shape — and an
 * unrecognised token means **no location recovered**, which is a finding the document can
 * act on, not a silent wrong answer.
 */
export const PLACES = {
  countries: {
    en: ['Germany', 'Italy', 'Austria', 'Switzerland', 'United Kingdom', 'UK', 'Ireland',
      'Netherlands', 'Belgium', 'France', 'Spain', 'Portugal', 'Poland', 'Czechia',
      'Denmark', 'Sweden', 'Norway', 'Finland', 'United States', 'USA', 'Canada'],
    de: ['Deutschland', 'Italien', 'Österreich', 'Schweiz', 'Vereinigtes Königreich',
      'Niederlande', 'Belgien', 'Frankreich', 'Spanien', 'Portugal', 'Polen', 'Tschechien',
      'Dänemark', 'Schweden', 'Norwegen', 'Finnland'],
    it: ['Germania', 'Italia', 'Austria', 'Svizzera', 'Regno Unito', 'Irlanda', 'Paesi Bassi',
      'Belgio', 'Francia', 'Spagna', 'Portogallo', 'Polonia', 'Danimarca', 'Svezia', 'Norvegia']
  },
  // The German states, because a German CV writes one and a parser that does not know them
  // reads "Thuringia" as a town and stops.
  regions: {
    en: ['Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
      'Hesse', 'Lower Saxony', 'Mecklenburg-Vorpommern', 'North Rhine-Westphalia',
      'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein',
      'Thuringia'],
    de: ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
      'Hessen', 'Niedersachsen', 'Mecklenburg-Vorpommern', 'Nordrhein-Westfalen',
      'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein',
      'Thüringen'],
    it: ['Baviera', 'Berlino', 'Amburgo', 'Assia', 'Bassa Sassonia', 'Sassonia', 'Turingia']
  }
};

const INDEX = new Map();
for (const [kind, byLanguage] of Object.entries(PLACES)) {
  for (const [language, names] of Object.entries(byLanguage)) {
    for (const name of names) {
      if (!INDEX.has(fold(name))) INDEX.set(fold(name), { kind, language });
    }
  }
}

export class PlaceLexicon {
  /**
   * Whether a token names a place this list knows.
   * @param {string} token - One comma-separated part
   * @returns {{kind: string, language: string}|null} What it names
   */
  static recognise(token) {
    return INDEX.get(fold(token)) || null;
  }

  /**
   * A location line, when its last part is a recognised place.
   *
   * Returns null otherwise, and null is the honest answer: without a known place there is
   * no way to tell an address from an employer and a city.
   * @param {string} line - A candidate line
   * @returns {string|null} The location as written
   */
  static locationIn(line) {
    const text = String(line ?? '').trim();
    if (!text || /[@\d]/.test(text)) return null;
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) return null;
    return PlaceLexicon.recognise(parts[parts.length - 1]) ? text : null;
  }
}

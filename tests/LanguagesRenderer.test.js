import { JSDOM } from 'jsdom';
import { LanguagesRenderer } from '../renderers/LanguagesRenderer.js';
import { fedTheModel } from './support/model.js';

describe('LanguagesRenderer', () => {
  // A level is prose, and a wrap beside its dash would strand it at the edge of a line (#180).
  test('holds the dash in a level to the words either side of it', () => {
    const { document } = new JSDOM(
      '<!doctype html><html><body><ul id="languages"></ul></body></html>'
    ).window;

    fedTheModel(new LanguagesRenderer()).render(document, {
      languages: [{ name: 'English', level: 'C1 — professional working proficiency' }]
    });

    const item = document.querySelector('#languages li');
    expect([...item.querySelectorAll('.no-break')].map((span) => span.textContent)).toEqual([
      ' — '
    ]);
    expect(item.textContent).toBe('English: C1 — professional working proficiency');
  });
});

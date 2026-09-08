import { JSDOM } from 'jsdom';
import { DocumentLocalizer } from '../core/DocumentLocalizer.js';

describe('DocumentLocalizer', () => {
  test('localizes text, attributes, metadata and HTML language', () => {
    const document = new JSDOM(`<!doctype html><html><head><title></title></head><body>
      <h2 data-i18n="cv:sections.experience"></h2>
      <img data-i18n-attr="alt:accessibility.profilePhoto">
    </body></html>`).window.document;
    const messages = {
      'meta.title': 'Giovanni Trovato – Lebenslauf',
      'cv:sections.experience': 'Berufserfahrung',
      'accessibility.profilePhoto': 'Porträt von Giovanni Trovato'
    };
    const i18n = { language: 'de', t: (key) => messages[key] };

    new DocumentLocalizer(i18n).apply(document, { name: 'Giovanni Trovato' });

    expect(document.documentElement.lang).toBe('de');
    expect(document.title).toBe('Giovanni Trovato – Lebenslauf');
    expect(document.querySelector('h2').textContent).toBe('Berufserfahrung');
    expect(document.querySelector('img').alt).toBe('Porträt von Giovanni Trovato');
  });

  test('keeps authored fallback text when a catalog key is unavailable', () => {
    const document = new JSDOM(`<!doctype html><html><body>
      <a data-i18n="layouts.classic">Classic ATS</a>
    </body></html>`).window.document;
    const i18n = { language: 'en', t: (key) => key };

    new DocumentLocalizer(i18n).apply(document);

    expect(document.querySelector('a').textContent).toBe('Classic ATS');
  });
});

import { CareerHighlightsRenderer } from '../renderers/CareerHighlightsRenderer.js';
import { JSDOM } from 'jsdom';
import { fedTheModel } from './support/model.js';

// The profile's summary of evidence, which only the pdfmake PDF used to show (#148). The page and its print
// carry it now, from the model, as text: a highlight is written by a person or a model, never markup (#157).
describe('CareerHighlightsRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <section class="career-highlights-section">
            <h3 class="section-title"><span data-i18n="cv:sections.selectedImpact"></span></h3>
            <ul id="career-highlights" class="career-highlights"></ul>
          </section>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = fedTheModel(new CareerHighlightsRenderer());
  });

  const list = () => document.getElementById('career-highlights');
  const section = () => document.querySelector('.career-highlights-section');
  const items = () => [...list().querySelectorAll('li')].map((item) => item.textContent);

  test('renders every highlight as an item of the list, in order', () => {
    renderer.render(document, {
      career_highlights: [
        '6 years owning an enterprise iOS MDM client',
        '~4,800 Android tests, 75% faster CI',
        'MDM clients across tens of thousands of devices'
      ]
    });

    expect(items()).toEqual([
      '6 years owning an enterprise iOS MDM client',
      '~4,800 Android tests, 75% faster CI',
      'MDM clients across tens of thousands of devices'
    ]);
    expect(section().hasAttribute('hidden')).toBe(false);
  });

  test.each([
    ['no list', {}],
    ['an empty list', { career_highlights: [] }],
    ['a list of blanks', { career_highlights: ['  ', ''] }]
  ])('hides the section, heading and all, for %s', (what, profile) => {
    renderer.render(document, profile);

    expect(section().hasAttribute('hidden')).toBe(true);
    expect(list().children).toHaveLength(0);
  });

  test('writes a highlight verbatim, never as markup', () => {
    renderer.render(document, { career_highlights: ['Cut crashes to <b>0.1%</b> at AT&T & co'] });

    expect(items()).toEqual(['Cut crashes to <b>0.1%</b> at AT&T & co']);
    expect(list().querySelector('li').children).toHaveLength(0);
    expect(list().querySelectorAll('b')).toHaveLength(0);
  });

  // A line broken at "UI-tested" extracts from the printed PDF as "UItested", as a role's achievements would.
  test('holds every hyphenated compound together, as a role’s achievements do', () => {
    renderer.render(document, { career_highlights: ['82% of app screens UI-tested'] });

    expect(items()).toEqual(['82% of app screens UI-tested']);
    expect([...list().querySelectorAll('li .no-break')].map((held) => held.textContent)).toEqual([
      'UI-tested'
    ]);
  });

  // "branch coverage 14% →" ended a line in Nerd Mode and "83%" opened the next (product review of #229).
  test('holds an arrow to the figures either side of it, as every separator is held', () => {
    renderer.render(document, {
      career_highlights: ['1,040 → 5,308 tests, branch coverage 14% → 83%']
    });

    expect(items()).toEqual(['1,040 → 5,308 tests, branch coverage 14% → 83%']);
    expect([...list().querySelectorAll('li .no-break')].map((held) => held.textContent)).toEqual([
      ' → ',
      ' → '
    ]);
  });

  test('rendering again replaces the list rather than adding to it', () => {
    renderer.render(document, { career_highlights: ['First'] });
    renderer.render(document, { career_highlights: ['Second'] });

    expect(items()).toEqual(['Second']);
  });

  test('handles a page without the list', () => {
    const empty = new JSDOM('<html><body></body></html>').window.document;

    expect(() => renderer.render(empty, { career_highlights: ['Led'] })).not.toThrow();
  });
});

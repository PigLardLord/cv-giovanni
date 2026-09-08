import { PrintFooterRenderer } from '../renderers/PrintFooterRenderer.js';
import { JSDOM } from 'jsdom';

const NO_BREAK_SPACE = '\u00A0';

/**
 * The line as it is written above, with each separator bound to its neighbours:
 * an ordinary space beside the glyph is a break opportunity, and a wrap there
 * would strand the separator at the edge of the line.
 */
const bound = (text) => text.replace(/ · /g, `${NO_BREAK_SPACE}·${NO_BREAK_SPACE}`);

describe('PrintFooterRenderer', () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div class="page-footers"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
  });

  const footers = () => document.querySelectorAll('.page-footers .page-footer');

  test('renders one footer per printed page', () => {
    new PrintFooterRenderer(2).render(document, { name: 'Giovanni Trovato' });

    expect(footers()).toHaveLength(2);
  });

  test('labels each footer with name, document kind and page position', () => {
    new PrintFooterRenderer(2).render(document, { name: 'Giovanni Trovato' });

    expect(footers()[0].textContent).toBe(bound('Giovanni Trovato · CV · 1/2'));
    expect(footers()[1].textContent).toBe(bound('Giovanni Trovato · CV · 2/2'));
  });

  test('uses the localized print catalog for PDF footers', () => {
    const i18n = {
      t: (key, options) => key === 'documentKind'
        ? 'Lebenslauf'
        : `${options.name} · ${options.documentKind} · ${options.page}/${options.pageCount}`
    };

    new PrintFooterRenderer(2, i18n).render(document, { name: 'Giovanni Trovato' });

    expect(footers()[1].textContent)
      .toBe(bound('Giovanni Trovato · Lebenslauf · 2/2'));
  });

  test('honours an injected page count', () => {
    new PrintFooterRenderer(3).render(document, { name: 'Giovanni Trovato' });

    expect(footers()).toHaveLength(3);
    expect(footers()[2].textContent).toBe(bound('Giovanni Trovato · CV · 3/3'));
  });

  test('defaults to a single page until the layout is measured', () => {
    new PrintFooterRenderer().render(document, { name: 'Giovanni Trovato' });

    expect(footers()).toHaveLength(1);
  });

  test('adopts the measured page count', () => {
    const renderer = new PrintFooterRenderer();
    renderer.setPageCount(5);
    renderer.render(document, { name: 'Giovanni Trovato' });

    expect(footers()).toHaveLength(5);
    expect(footers()[4].textContent).toContain('5/5');
  });

  /*
   * A footer anchored past the end of the content is not merely wrong: it is
   * pulled onto a sheet of its own and *creates* the blank page it numbers.
   */
  test('never renders fewer than one page of footers', () => {
    const renderer = new PrintFooterRenderer();

    [0, -3, NaN, undefined, 'two'].forEach((bad) => {
      renderer.setPageCount(bad);
      expect(renderer.pageCount).toBe(1);
    });
  });

  test('tags each footer with the zero-based page it is anchored to', () => {
    new PrintFooterRenderer(3).render(document, { name: 'Giovanni Trovato' });

    expect([...footers()].map((footer) => footer.style.getPropertyValue('--page-index')))
      .toEqual(['0', '1', '2']);
  });

  test('degrades gracefully on missing data or container', () => {
    const renderer = new PrintFooterRenderer(2);

    expect(() => renderer.render(document, {})).not.toThrow();
    expect(() => renderer.render(document, null)).not.toThrow();
    expect(footers()).toHaveLength(0);

    const bare = new JSDOM('<html><body></body></html>').window.document;
    expect(() => renderer.render(bare, { name: 'Giovanni Trovato' })).not.toThrow();
  });
});

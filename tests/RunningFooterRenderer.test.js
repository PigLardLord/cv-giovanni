import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import i18next from '../vendor/i18next/i18next.js';
import { I18nService } from '../core/I18nService.js';
import { RunningFooterRenderer } from '../renderers/RunningFooterRenderer.js';
import { fedTheModel } from './support/model.js';

// Page 2 of the printed CV said neither whose CV it was nor that a page 1 existed (#158). A page-margin box prints the
// line, and its content cannot read the page, so the renderer hands it over as a print-only rule. print.css sets how
// it looks and keeps it off page 1; the renderer writes only what it says.

/** The print catalogue in a language, through i18next as the page reads it. */
const i18nIn = async (locale) => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    resources: {
      [locale]: {
        print: JSON.parse(
          readFileSync(new URL(`../locales/${locale}/print.json`, import.meta.url), 'utf8')
        )
      }
    },
    ns: ['ui', 'cv', 'print'],
    defaultNS: 'ui',
    interpolation: { escapeValue: false }
  });
  return new I18nService(instance);
};

const pageWith = () =>
  new JSDOM(`<!doctype html><html><head>
    <link rel="stylesheet" href="style.css" />
    <link rel="stylesheet" href="print.css" media="print" />
  </head><body><h1 id="name"></h1></body></html>`).window.document;
const written = (document) => [...document.head.querySelectorAll('style[data-running-footer]')];

describe('RunningFooterRenderer', () => {
  test('writes the footer as one print-only rule, after the print stylesheet', async () => {
    const document = pageWith();

    fedTheModel(new RunningFooterRenderer(await i18nIn('en'))).render(document, {
      name: 'Ada Lovelace'
    });

    const [style, ...more] = written(document);
    expect(more).toEqual([]);
    expect(style.getAttribute('media')).toBe('print');
    expect(style.textContent).toBe(
      '@page { @bottom-right { content: "Ada Lovelace · CV · " counter(page) "/" counter(pages); } }'
    );
    // Last in the head, so its rule follows print.css's `content: none` and replaces it.
    expect(document.head.lastElementChild).toBe(style);
    // Nothing reaches the page's text: the line exists on paper only.
    expect(document.body.textContent).not.toContain('Ada Lovelace');
  });

  test('in German, in the catalogue’s words', async () => {
    const document = pageWith();

    fedTheModel(new RunningFooterRenderer(await i18nIn('de'))).render(document, {
      name: 'Ada Lovelace'
    });

    expect(written(document)[0].textContent).toContain(
      'content: "Ada Lovelace · Lebenslauf · " counter(page) "/" counter(pages);'
    );
  });

  // A name is data, and the rule is CSS: a quote in it must not close the string, a backslash must not start an escape,
  // and a line break, which a CSS string cannot hold, must not end the rule.
  test('escapes quotes, backslashes and line breaks in the name', async () => {
    const document = pageWith();

    fedTheModel(new RunningFooterRenderer(await i18nIn('en'))).render(document, {
      name: 'Ada "Countess" Love\\lace\nKing\r\nNoel\fByron'
    });

    expect(written(document)[0].textContent).toBe(
      '@page { @bottom-right { content: "Ada \\"Countess\\" Love\\\\lace\\A King\\A Noel\\A Byron · CV · " ' +
        'counter(page) "/" counter(pages); } }'
    );
  });

  test('a second render replaces the rule, never adds one', async () => {
    const document = pageWith();
    const renderer = fedTheModel(new RunningFooterRenderer(await i18nIn('en')));

    renderer.render(document, { name: 'Ada Lovelace' });
    renderer.render(document, { name: 'Grace Hopper' });

    expect(written(document)).toHaveLength(1);
    expect(written(document)[0].textContent).toContain('"Grace Hopper · CV · "');
    expect(document.head.lastElementChild).toBe(written(document)[0]);
  });

  // A footer naming nobody says nothing, and one left from an earlier render would name someone else.
  test('a profile without a name has no footer, and loses the one it had', async () => {
    const document = pageWith();
    const renderer = fedTheModel(new RunningFooterRenderer(await i18nIn('en')));

    renderer.render(document, { name: 'Ada Lovelace' });
    renderer.render(document, { name: '' });

    expect(written(document)).toEqual([]);
  });

  test('without a catalogue it writes nothing', () => {
    const document = pageWith();

    fedTheModel(new RunningFooterRenderer()).render(document, { name: 'Ada Lovelace' });
    new RunningFooterRenderer().render(document, null);

    expect(written(document)).toEqual([]);
  });
});

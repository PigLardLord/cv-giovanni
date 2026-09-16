/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { offerDownload } from '../renderers/downloadLinks.js';

// The Download PDF link lived only in the footer, after the whole CV: 4,070px down a 4,124px page in Nerd
// Mode at 1440px, 4,909px down on a phone (#59). A copy went to the top of the page, beside a footer that kept
// its own copy and a Browser print button: two routes to one document once the PDF is printed from the page.
// The owner chose one control, the one at the top (#150).
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const load = () => new JSDOM(read('index.html')).window.document;
const links = (document) => [...document.querySelectorAll('[data-download-pdf]')];
const offer = {
  href: 'generated/ada-lovelace-general-en-nerd.pdf',
  filename: 'Ada-Lovelace-Engineer-CV.pdf'
};

describe('the Download PDF link', () => {
  test("is the page's one download control, after the layout switcher", () => {
    const document = load();
    const [link] = links(document);

    expect(links(document)).toHaveLength(1);
    expect(link.previousElementSibling.matches('nav.layout-switcher')).toBe(true);
    expect(link.querySelector('[data-i18n="actions.downloadPdf"]')).not.toBeNull();
  });

  test('the footer that carried a second copy and Browser print is gone', () => {
    const document = load();

    expect(document.querySelector('footer.print-footer')).toBeNull();
    expect(document.querySelector('#print-browser')).toBeNull();
    expect(document.querySelector('[data-i18n="actions.print"]')).toBeNull();
  });

  test.each(['en', 'de'])('the %s catalogue labels no print action', (locale) => {
    const { actions } = JSON.parse(read(`locales/${locale}/ui.json`));

    expect(Object.keys(actions)).toEqual(['downloadPdf']);
  });

  test('offers the file the generator wrote', () => {
    const document = load();

    offerDownload(document, offer);

    expect(
      links(document).map((link) => [link.getAttribute('href'), link.download, link.hidden])
    ).toEqual([[offer.href, offer.filename, false]]);
  });

  test('with no file for this profile, locale and layout, it is hidden', () => {
    const document = load();

    offerDownload(document, null);

    expect(links(document).map((link) => link.hidden)).toEqual([true]);
  });

  // `.print-button` sets `display`, which beats the browser's own rule for `[hidden]`: a hidden link
  // still showed, and would have 404ed.
  test('a hidden button stays hidden whatever display its class gives it', () => {
    expect(read('style.css')).toMatch(
      /\.print-button\[hidden\]\s*\{\s*display:\s*none\s*!important;/
    );
  });
});

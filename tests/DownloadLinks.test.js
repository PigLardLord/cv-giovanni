/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { offerDownload } from '../renderers/downloadLinks.js';

// The Download PDF link lived only in the footer, after the whole CV: 4,070px down a 4,124px page in Nerd
// Mode at 1440px, 4,909px down on a phone (#59). Nerd Mode's toolbar now carries a second copy, where an
// editor puts Run, and every copy is offered or hidden together.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const load = () => new JSDOM(read('index.html')).window.document;
const links = (document) => [...document.querySelectorAll('[data-download-pdf]')];
const offer = {
  href: 'generated/ada-lovelace-general-en-nerd.pdf',
  filename: 'Ada-Lovelace-Engineer-CV.pdf'
};

describe('the Download PDF link', () => {
  test('sits at the end of the toolbar and in the footer, under one label', () => {
    const document = load();
    const [toolbar, footer] = links(document);

    expect(links(document)).toHaveLength(2);
    expect(toolbar.previousElementSibling.matches('nav.layout-switcher')).toBe(true);
    expect(footer.closest('footer.print-footer')).not.toBeNull();
    for (const link of [toolbar, footer]) {
      expect(link.querySelector('[data-i18n="actions.downloadPdf"]')).not.toBeNull();
    }
  });

  test('every copy offers the file the generator wrote', () => {
    const document = load();

    offerDownload(document, offer);

    expect(
      links(document).map((link) => [link.getAttribute('href'), link.download, link.hidden])
    ).toEqual([
      [offer.href, offer.filename, false],
      [offer.href, offer.filename, false]
    ]);
  });

  test('with no file for this profile, locale and layout, every copy is hidden', () => {
    const document = load();

    offerDownload(document, null);

    expect(links(document).map((link) => link.hidden)).toEqual([true, true]);
  });

  // `.print-button` sets `display`, which beats the browser's own rule for `[hidden]`: a hidden link
  // still showed, and would have 404ed.
  test('a hidden button stays hidden whatever display its class gives it', () => {
    expect(read('style.css')).toMatch(/\.print-button\[hidden\]\s*\{\s*display:\s*none;/);
  });
});

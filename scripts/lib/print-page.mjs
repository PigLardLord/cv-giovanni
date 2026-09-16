import { within } from './devtools-session.mjs';

/**
 * Evaluated after the page switches to print media: lays the page out for paper, so every font the print
 * stylesheet asks for is requested, waits for those loads to settle, and returns the faces that failed.
 */
const PRINT_FONTS = `(() => {
  document.body.getBoundingClientRect();
  return document.fonts.ready.then(() =>
    [...document.fonts]
      .filter((face) => face.status === 'error')
      .map((face) => face.family.replace(/["']/g, '') + ' ' + face.weight)
  );
})()`;

/**
 * Prints a page to PDF through a DevTools session, with the fonts its print stylesheet asks for (#143).
 *
 * Printed from the command line, Chrome laid the page out for paper before those fonts had arrived and set
 * the text in the variable screen face it already held: Type 3 fonts in the PDF, and headings a drawing-order
 * parser read as "MobileSoftwareEngineer". So the page is switched to print media first, and the PDF is made
 * only once the fonts that switch requested have loaded.
 * @param {{ send: Function, next: Function, evaluate: Function }} chrome - A DevTools session on a page tab
 * @param {string} address - The page to print
 * @param {{ ready: string[] }} options - Expressions that resolve once the page has rendered, awaited in order
 * @returns {Promise<Buffer>} The PDF
 * @throws {Error} When a print font failed to load: a page printed in a fallback face must not be kept
 */
export async function printPage(chrome, address, { ready = [] } = {}) {
  const loaded = chrome.next('Page.loadEventFired');
  await chrome.send('Page.navigate', { url: address });
  await within(loaded, 30000, `${address} did not load`);
  for (const expression of ready) {
    await within(chrome.evaluate(expression), 30000, `${address} did not render`);
  }
  await chrome.send('Emulation.setEmulatedMedia', { media: 'print' });
  try {
    const failed = await within(
      chrome.evaluate(PRINT_FONTS),
      30000,
      `${address} did not load its print fonts`
    );
    if (failed.length) {
      throw new Error(`${address} could not load its print fonts: ${failed.join(', ')}`);
    }
    const { data } = await chrome.send('Page.printToPDF', {
      preferCSSPageSize: true,
      displayHeaderFooter: false
    });
    return Buffer.from(data, 'base64');
  } finally {
    await chrome.send('Emulation.setEmulatedMedia', { media: '' });
  }
}

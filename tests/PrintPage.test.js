import { printPage } from '../scripts/lib/print-page.mjs';

// Printed from the command line, Chrome laid the page out for paper before the fonts the print stylesheet
// asks for had arrived, and set it in the variable screen face it already had: Type 3 fonts, and headings
// with no word spaces in drawing order (#143). So the page is switched to print media first, the fonts that
// switch asks for are awaited, and only then is the PDF made.
function fakeChrome({ fonts = [] } = {}) {
  const calls = [];
  return {
    calls,
    next: (event) => {
      calls.push(['next', event]);
      return Promise.resolve({});
    },
    send: (method, params = {}) => {
      calls.push([method, params]);
      if (method === 'Page.printToPDF')
        return Promise.resolve({ data: Buffer.from('%PDF').toString('base64') });
      return Promise.resolve({});
    },
    evaluate: (expression) => {
      calls.push(['evaluate', expression]);
      return Promise.resolve(expression.includes('document.fonts') ? fonts : true);
    }
  };
}

describe('printing a page', () => {
  test('waits for the page, switches to print media, awaits its fonts, and only then prints', async () => {
    const chrome = fakeChrome();

    const pdf = await printPage(chrome, 'http://127.0.0.1:1/index.html?layout=nerd', {
      ready: ['READY_ONE', 'READY_TWO']
    });

    const steps = chrome.calls.map(([name, detail]) =>
      name === 'evaluate'
        ? detail.includes('document.fonts')
          ? 'fonts'
          : detail
        : name === 'Emulation.setEmulatedMedia'
          ? `media:${detail.media}`
          : name
    );
    expect(steps).toEqual([
      'next',
      'Page.navigate',
      'READY_ONE',
      'READY_TWO',
      'media:print',
      'fonts',
      'Page.printToPDF',
      'media:'
    ]);
    expect(pdf.toString()).toBe('%PDF');
  });

  test('prints at the page size the stylesheet declares, with no header or footer', async () => {
    const chrome = fakeChrome();

    await printPage(chrome, 'http://127.0.0.1:1/', { ready: [] });

    expect(chrome.calls.find(([name]) => name === 'Page.printToPDF')[1]).toMatchObject({
      preferCSSPageSize: true,
      displayHeaderFooter: false
    });
  });

  test('refuses to print a page whose print fonts failed to load, and names them', async () => {
    const chrome = fakeChrome({ fonts: ['Inter 700'] });

    await expect(printPage(chrome, 'http://127.0.0.1:1/', { ready: [] })).rejects.toThrow(
      /Inter 700/
    );
    expect(chrome.calls.some(([name]) => name === 'Page.printToPDF')).toBe(false);
  });
});

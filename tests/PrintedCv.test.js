import { builtCv, printLayouts } from '../scripts/lib/printed-cv.mjs';
import { CvFiles } from '../core/CvFiles.js';

// The downloadable PDF is the page, printed by Chrome, where pdfmake used to compose a second design (#144,
// #149). The generator writes it and the print audit reads it, so both name the files through one rule.
const data = { name: 'Ada Lovelace', title: 'Analyst' };
const target = { profile: 'general', locale: 'en', outDir: 'generated' };

function fakeChrome() {
  const calls = [];
  return {
    calls,
    next: () => Promise.resolve({}),
    send: (method, params = {}) => {
      calls.push([method, params]);
      return Promise.resolve(
        method === 'Page.printToPDF' ? { data: Buffer.from('%PDF').toString('base64') } : {}
      );
    },
    evaluate: (expression) => Promise.resolve(expression.includes('document.fonts') ? [] : true)
  };
}

describe('the CV printed from the page', () => {
  test('prints every layout of the profile and locale, once each, in order', async () => {
    const chrome = fakeChrome();
    const written = [];

    await printLayouts(
      chrome,
      { origin: 'http://127.0.0.1:4000', key: 'KEY', target, name: data.name },
      ['nerd', 'spotlight'],
      async (layout, pdf) => written.push([layout, pdf.toString()])
    );

    const addresses = chrome.calls
      .filter(([method]) => method === 'Page.navigate')
      .map(([, { url }]) => url);
    expect(addresses).toEqual([
      'http://127.0.0.1:4000/index.html?layout=nerd&profile=general&lang=en&key=KEY',
      'http://127.0.0.1:4000/index.html?layout=spotlight&profile=general&lang=en&key=KEY'
    ]);
    expect(written).toEqual([
      ['nerd', '%PDF'],
      ['spotlight', '%PDF']
    ]);
  });

  test('names each layout the file the page offers for download', () => {
    const { files } = builtCv(target, data, ['nerd', 'technical'], () => true);

    const named = (layout) => new CvFiles().filename(data, { ...target, layout });
    expect(files).toEqual([
      { layout: 'nerd', filename: named('nerd'), path: `generated/${named('nerd')}` },
      { layout: 'technical', filename: named('technical'), path: `generated/${named('technical')}` }
    ]);
  });

  // An audit that reads a file nobody built checks nothing, and must say so rather than pass.
  test('names the layouts whose file was never built', () => {
    const built = 'generated/ada-lovelace-general-en-nerd.pdf';

    expect(builtCv(target, data, ['nerd', 'technical'], (path) => path === built).missing).toEqual([
      'generated/ada-lovelace-general-en-technical.pdf'
    ]);
  });
});

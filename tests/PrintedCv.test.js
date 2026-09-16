import { builtCv, builtLetters, printLayouts, printLetters } from '../scripts/lib/printed-cv.mjs';
import { CvFiles } from '../core/CvFiles.js';

// The downloadable PDF is the page, printed by Chrome, where pdfmake used to compose a second design (#144,
// #149). The generator writes it and the print audit reads it, so both name the files through one rule.
const data = { name: 'Ada Lovelace', title: 'Analyst' };
const target = { profile: 'general', locale: 'en', outDir: 'generated' };

function fakeChrome() {
  const calls = [];
  const evaluated = [];
  return {
    calls,
    evaluated,
    next: () => Promise.resolve({}),
    send: (method, params = {}) => {
      calls.push([method, params]);
      return Promise.resolve(
        method === 'Page.printToPDF' ? { data: Buffer.from('%PDF').toString('base64') } : {}
      );
    },
    evaluate: (expression) => {
      evaluated.push(expression);
      return Promise.resolve(expression.includes('document.fonts') ? [] : true);
    }
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

// The cover letter is a page too, printed by the same browser from letter.html (#151), under the name pdfmake gave
// it. The published profile carries no letter, so none is printed for it and none is looked for.
describe('the cover letter printed from its page', () => {
  const tailored = { ...data, letter: { subject: 'Application for Analyst' } };

  test('prints the letter page of every layout, once its letterhead names the candidate', async () => {
    const chrome = fakeChrome();
    const written = [];

    await printLetters(
      chrome,
      { origin: 'http://127.0.0.1:4000', key: 'KEY', target, name: data.name },
      ['nerd', 'technical'],
      async (layout, pdf) => written.push([layout, pdf.toString()])
    );

    const addresses = chrome.calls
      .filter(([method]) => method === 'Page.navigate')
      .map(([, { url }]) => url);
    expect(addresses).toEqual([
      'http://127.0.0.1:4000/letter.html?layout=nerd&profile=general&lang=en&key=KEY',
      'http://127.0.0.1:4000/letter.html?layout=technical&profile=general&lang=en&key=KEY'
    ]);
    expect(written).toEqual([
      ['nerd', '%PDF'],
      ['technical', '%PDF']
    ]);
    expect(chrome.evaluated.some((expression) => expression.includes('"#letter-name"'))).toBe(true);
    expect(chrome.evaluated.some((expression) => expression.includes('"#name"'))).toBe(false);
  });

  test('names each letter as the CV files name it, beside its layout', () => {
    const { files, missing } = builtLetters(target, tailored, ['nerd', 'spotlight'], () => true);

    const named = (layout) => new CvFiles().letterFilename(tailored, { ...target, layout });
    expect(files).toEqual([
      { layout: 'nerd', filename: named('nerd'), path: `generated/${named('nerd')}` },
      { layout: 'spotlight', filename: named('spotlight'), path: `generated/${named('spotlight')}` }
    ]);
    expect(missing).toEqual([]);
  });

  test('names the letters never built', () => {
    const built = 'generated/ada-lovelace-general-en-nerd-cover.pdf';

    expect(
      builtLetters(target, tailored, ['nerd', 'technical'], (path) => path === built).missing
    ).toEqual(['generated/ada-lovelace-general-en-technical-cover.pdf']);
  });

  test('a profile without a letter has no letter to print, and none missing', () => {
    expect(builtLetters(target, data, ['nerd', 'technical'], () => false)).toEqual({
      files: [],
      missing: []
    });
  });
});

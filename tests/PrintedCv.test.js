import {
  builtCv,
  builtLetters,
  letterWarnings,
  printLayouts,
  profileWarnings,
  printLetters
} from '../scripts/lib/printed-cv.mjs';
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

// The build prints a letter it knows is flawed, because the print audit is the gate; but it says so first, where whoever
// runs it can see which profile to correct (the review of #151).
describe("the build's warnings about a letter", () => {
  const letter = {
    recipient: {
      company: 'Beispiel GmbH',
      name: 'Anna Schmidt',
      form: 'ms',
      surname: 'Schmidt',
      address: ['Musterstraße 12']
    },
    subject: 'Application',
    opening: 'I write.',
    body: ['About the role.'],
    signature: 'Ada Lovelace'
  };
  const path = 'applications/acme/en.json';

  test('a profile without a letter, or with a sound one, has nothing to warn about', () => {
    expect(letterWarnings(path, data)).toEqual([]);
    expect(letterWarnings(path, { ...data, letter })).toEqual([]);
  });

  test('names the profile and each problem of its letter', () => {
    const crowded = {
      ...data,
      letter: {
        ...letter,
        opening: '',
        recipient: { ...letter.recipient, role: 'Talent', address: ['A', 'B', 'C', 'D'] }
      }
    };

    expect(letterWarnings(path, crowded)).toEqual([
      'warning: the cover letter in applications/acme/en.json — opening: missing',
      'warning: the cover letter in applications/acme/en.json — recipient: 7 lines, the address zone holds 6'
    ]);
  });

  // A named recipient nobody said how to address is greeted neutrally, and the author hears which field to fill (#174).
  test('names a recipient greeted neutrally for want of a form of address', () => {
    const { form, ...recipient } = letter.recipient;

    expect(form).toBe('ms');
    expect(letterWarnings(path, { ...data, letter: { ...letter, recipient } })).toEqual([
      'warning: the cover letter in applications/acme/en.json — recipient.form: missing'
    ]);
  });
});

// A profile may leave out a role's location, a degree's period, or a certification's issuer or year, and it still builds:
// the shape leaves them optional. But each carries credibility, so the build says which before the PDFs leave the
// machine (#178), and writes them anyway.
describe("the build's warnings about what a profile leaves out", () => {
  const path = 'applications/acme/en.json';
  const complete = {
    ...data,
    relevant_experience: [
      { title: 'Analyst', company: 'Engines Ltd', location: 'London', period: '1842 – 1843' },
      { title: 'Translator', company: 'Taylor', location: 'London', period: '1843' }
    ],
    education: [{ degree: 'Mathematics', school: 'Home tuition', period: '1830 – 1835' }],
    certifications: [{ name: 'Notes on the Engine', issuer: 'Taylor', year: 1843 }]
  };

  test('a profile that leaves nothing out has nothing to warn about', () => {
    expect(profileWarnings(path, complete)).toEqual([]);
    expect(profileWarnings(path, data)).toEqual([]);
  });

  test('names the profile, and each field it leaves out with what the print loses', () => {
    const sparse = JSON.parse(JSON.stringify(complete));
    delete sparse.relevant_experience[1].location;
    delete sparse.education[0].period;
    delete sparse.certifications[0].issuer;
    delete sparse.certifications[0].year;

    expect(profileWarnings(path, sparse)).toEqual([
      'warning: applications/acme/en.json — relevant_experience[1].location is missing: the role "Translator" at Taylor prints with no place, while 1 other role names one',
      'warning: applications/acme/en.json — education[0].period is missing: the degree "Mathematics" prints with no date',
      'warning: applications/acme/en.json — certifications[0].issuer is missing: "Notes on the Engine" prints with no issuer, so nobody can tell who awarded it',
      'warning: applications/acme/en.json — certifications[0].year is missing: "Notes on the Engine" prints with no year, so nobody can tell it current from lapsed'
    ]);
  });
});

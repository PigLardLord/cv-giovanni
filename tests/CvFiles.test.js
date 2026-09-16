import { CvFiles } from '../core/CvFiles.js';
import { LetterExporter } from '../core/LetterExporter.js';

// The rules that name the files a CV is delivered as, which the page, the generator and the print audit share
// (#145).
describe('CvFiles', () => {
  const data = {
    name: 'Giovanni Trovato',
    title: 'Engineer',
    location: 'Germany',
    email: 'a@b.c',
    phone: '123',
    profile: 'Profile',
    skills: [],
    relevant_experience: [],
    education: [],
    languages: [],
    certifications: []
  };

  const rich = {
    name: 'Giovanni Trovato',
    title: 'Senior iOS Engineer',
    location: 'Germany',
    email: 'a@b.c',
    phone: '123',
    availability: 'EU citizen',
    portfolio: 'https://portfolio.example',
    social: [{ platform: 'GitHub', url: 'https://github.com/example' }],
    profile: 'Profile',
    skills: [],
    relevant_experience: [],
    career_highlights: [
      '6 years owning an enterprise iOS MDM client from its first commit',
      '~4,800 Android tests, 82% UI coverage, 75% faster CI feedback',
      'MDM clients in production across tens of thousands of managed devices'
    ],
    education: [{ degree: 'M.Sc.', school: 'Pisa', period: '2013 - 2015', description: 'Mobile' }],
    languages: [{ name: 'Italian', level: 'Native' }],
    certifications: [
      {
        name: 'iOS Lead Essentials',
        issuer: 'Academy',
        year: 2024,
        url: 'https://academy.example/achievement',
        description: 'Advanced'
      }
    ]
  };

  test('builds a direct path for pre-generated downloads', () => {
    const files = new CvFiles();
    expect(files.filePath(data, { profile: 'general', locale: 'en', layout: 'technical' })).toBe(
      'generated/giovanni-trovato-general-en-technical.pdf'
    );
  });

  // The candidate's name was a literal in the naming rule, derived from nothing: a profile for anyone
  // else still produced files named after this repository's owner (#34).
  test('names every file after the candidate its profile describes', () => {
    const files = new CvFiles();
    const options = { profile: 'acme', locale: 'de', layout: 'nerd' };

    expect(files.filename({ ...data, name: 'Ada Lovelace' }, options)).toBe(
      'ada-lovelace-acme-de-nerd.pdf'
    );
    expect(files.filename({ ...data, name: 'Niccolò D’Amico' }, options)).toBe(
      'niccolo-d-amico-acme-de-nerd.pdf'
    );
  });

  // The cover letter is printed from its own page now, and the generator and the print audit name it without
  // loading pdfmake's composer (#151). The name is the one pdfmake gave it, so nothing that reads `-cover` changes.
  test('names the cover letter beside the CV it goes with, as pdfmake named it', () => {
    const files = new CvFiles();
    const options = { profile: 'acme', locale: 'de', layout: 'spotlight' };

    expect(files.letterFilename({ ...data, name: 'Ada Lovelace' }, options)).toBe(
      'ada-lovelace-acme-de-spotlight-cover.pdf'
    );
    for (const layout of ['nerd', 'spotlight', 'technical']) {
      expect(files.letterFilename(rich, { ...options, layout })).toBe(
        new LetterExporter(null, { t: (key) => key }).filename(rich, { ...options, layout })
      );
    }
  });

  test('refuses to name a file for a profile without a name', () => {
    const files = new CvFiles();

    expect(() => files.filename({ ...data, name: ' ' }, {})).toThrow(/no name/);
    expect(() => files.filename({ ...data, name: null }, {})).toThrow(/no name/);
  });

  test('names the delivered file after the person and the role, not the build system', () => {
    // The recruiter's inbox receives this name. 'general', 'en' and 'spotlight' are build words,
    // and the role is the one thing that helps them find the file again.
    const files = new CvFiles();
    expect(files.downloadName(rich)).toBe('Giovanni-Trovato-Senior-iOS-Engineer-CV.pdf');
    expect(files.downloadName({})).toBe('CV.pdf');
    expect(files.downloadName({ name: 'Niccolò D’Amico', title: 'iOS Engineer' })).toBe(
      'Niccolo-D-Amico-iOS-Engineer-CV.pdf'
    );
  });

  test('offers a download only for a combination that was actually generated', () => {
    // The link used to be built from the naming rule alone, so it pointed at a file whenever
    // the rule could name one. Today the German profile fails earlier and hides the bug; the
    // day profiles/general/de.json lands, the page renders and the button 404s in silence.
    const files = new CvFiles();
    const generated = [
      'giovanni-trovato-general-en-spotlight.pdf',
      'giovanni-trovato-general-en-nerd.pdf'
    ];
    const spotlight = { profile: 'general', locale: 'en', layout: 'spotlight' };
    expect(files.isAvailable(generated, rich, spotlight)).toBe(true);
    expect(files.isAvailable(generated, rich, { ...spotlight, locale: 'de' })).toBe(false);
    expect(files.isAvailable(generated, rich, { ...spotlight, layout: 'technical' })).toBe(false);
    // Another candidate's file is not this one's, and a page whose profile failed to load has none.
    expect(files.isAvailable(generated, { ...rich, name: 'Ada Lovelace' }, spotlight)).toBe(false);
    expect(files.isAvailable(generated, undefined, spotlight)).toBe(false);
    expect(files.isAvailable(generated, { ...rich, name: '' }, spotlight)).toBe(false);
    expect(files.isAvailable(generated, { ...rich, name: null }, spotlight)).toBe(false);
  });

  test('treats a missing or unreadable manifest as nothing being available', () => {
    // A manifest that failed to load must not read as "everything is there": the page would
    // offer every download and 404 on all of them.
    const files = new CvFiles();
    expect(files.isAvailable(undefined, rich, { locale: 'en', layout: 'spotlight' })).toBe(false);
    expect(files.isAvailable([], rich, { locale: 'en', layout: 'spotlight' })).toBe(false);
    expect(files.isAvailable('not a list', rich, { locale: 'en', layout: 'spotlight' })).toBe(
      false
    );
  });
});

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import i18next from '../vendor/i18next/i18next.js';
import { LetterContent } from '../core/LetterContent.js';
import { CoverLetter } from '../domain/CoverLetter.js';
import { catalogueTranslator } from '../scripts/lib/printed-letter.mjs';

// The words of a cover letter, decided once and read by the page that prints it and by the audit that checks
// the print (#151). pdfmake's letter layout decided them beside its geometry in points until #153; these are its
// behavioural tests, carried over to the module that now decides.
const strings = {
  'cv:letter.subject': 'Application',
  'cv:letter.salutationMs': 'Dear Ms {{surname}}',
  'cv:letter.salutationMr': 'Dear Mr {{surname}}',
  'cv:letter.salutationMsTitled': 'Dear {{title}} {{surname}}',
  'cv:letter.salutationMrTitled': 'Dear {{title}} {{surname}}',
  'cv:letter.salutationNeutral': 'Dear {{name}}',
  'cv:letter.salutationAnonymous': 'Dear Hiring Team',
  'cv:letter.closing': 'Kind regards,',
  'cv:letter.attachments': 'Enclosed',
  'ui:letter.absent': 'This profile carries no cover letter.'
};
const t = (key, values = {}) =>
  (strings[key] || key).replace(
    /\{\{(\w+)\}\}/g,
    (placeholder, name) => values[name] ?? placeholder
  );

const letter = {
  recipient: {
    name: 'Anna Weber',
    role: 'Talent Lead',
    company: 'ActAI',
    address: ['Chausseestraße 1', '10115 Berlin']
  },
  date: '2026-09-09',
  reference: 'REQ-1042',
  subject: 'Application for iOS Software Engineer',
  opening: 'I am writing about the iOS Software Engineer position.',
  body: ['Six years owning an enterprise MDM client.'],
  closing: 'I would welcome the chance to talk.',
  signature: 'Giovanni Trovato',
  attachments: ['Curriculum vitae']
};
const profile = (changes = {}, identity = {}) => ({
  name: 'Giovanni Trovato',
  title: 'Senior iOS Engineer',
  location: 'Bad Liebenstein',
  email: 'trovato.giovanni@gmail.com',
  phone: '+39 329 8484 046',
  ...identity,
  letter: { ...letter, ...changes }
});
const words = (data, locale = 'en') => LetterContent.of(data, { t, locale }).letter;

/** Every word the letter says, in the order it says them. */
const readingOrder = (content) =>
  [
    content.sender.name,
    content.sender.contact,
    content.returnAddress,
    ...content.recipient,
    content.date,
    content.reference,
    content.subject,
    content.salutation,
    ...content.paragraphs,
    content.closingSentence,
    content.closing,
    content.signature,
    content.attachments
  ].filter(Boolean);

describe('whether a profile carries a letter', () => {
  test.each([
    ['no profile', undefined, false],
    ['no letter', { name: 'Ada' }, false],
    ['an empty letter', { name: 'Ada', letter: {} }, false],
    ['a letter', { name: 'Ada', letter: { subject: 'Hello' } }, true]
  ])('%s', (what, data, expected) => {
    expect(LetterContent.has(data)).toBe(expected);
  });

  // The page says so rather than printing an empty sheet, in the reader's language.
  test('a profile without one gets the notice, and no letter', () => {
    const content = LetterContent.of({ name: 'Giovanni Trovato' }, { t, locale: 'en' });

    expect(content.letter).toBeNull();
    expect(content.notice).toBe('This profile carries no cover letter.');
    expect(content.title).toBe('This profile carries no cover letter.');
  });
});

describe('who writes', () => {
  test('the letterhead carries the name, and the contacts present beneath it', () => {
    expect(words(profile()).sender).toEqual({
      name: 'Giovanni Trovato',
      contact: 'Bad Liebenstein · trovato.giovanni@gmail.com · +39 329 8484 046'
    });
  });

  test('a contact the profile does not write leaves no gap behind', () => {
    expect(words(profile({}, { phone: '', location: undefined })).sender.contact).toBe(
      'trovato.giovanni@gmail.com'
    );
  });

  // The return line sits in the address field above the recipient, where only a postal sender belongs: the email and
  // the phone are in the letterhead already.
  test('the return line names the sender and the place', () => {
    expect(words(profile()).returnAddress).toBe('Giovanni Trovato · Bad Liebenstein');
  });

  test('the document is titled after the sender and the subject', () => {
    expect(LetterContent.of(profile(), { t, locale: 'en' }).title).toBe(
      'Giovanni Trovato — Application for iOS Software Engineer'
    );
  });
});

describe('what the letter says', () => {
  const content = words(profile());
  const text = readingOrder(content).join('\n');

  // Every line the data wrote, and no line it did not: nothing here invents a recipient.
  test('the recipient is every line the data wrote, in the order a window shows it', () => {
    expect(content.recipient).toEqual([
      'ActAI',
      'Anna Weber',
      'Talent Lead',
      'Chausseestraße 1',
      '10115 Berlin'
    ]);
    expect(words(profile({ recipient: { company: 'ActAI' } })).recipient).toEqual(['ActAI']);
  });

  test('the recipient, the company and the reference are all in it', () => {
    expect(text).toContain('ActAI');
    expect(text).toContain('Anna Weber');
    expect(content.reference).toBe('REQ-1042');
  });

  test('the sender can be written back to', () => {
    expect(text).toContain('trovato.giovanni@gmail.com');
  });

  test('the subject, the body and the close are in reading order', () => {
    const order = [
      'ActAI',
      'Application for iOS Software Engineer',
      'Dear Anna Weber',
      'Six years owning',
      'I would welcome',
      'Kind regards',
      'Enclosed'
    ];
    const positions = order.map((fragment) => text.indexOf(fragment));

    expect(
      positions.every((at, index) => at >= 0 && (index === 0 || at > positions[index - 1]))
    ).toBe(true);
  });

  test('the paragraphs are the opening, then the body', () => {
    expect(content.paragraphs).toEqual([
      'I am writing about the iOS Software Engineer position.',
      'Six years owning an enterprise MDM client.'
    ]);
    expect(content.closingSentence).toBe('I would welcome the chance to talk.');
    expect(content.closing).toBe('Kind regards,');
  });

  test('a letter without a subject takes the catalogue’s', () => {
    expect(words(profile({ subject: '' })).subject).toBe('Application');
  });

  test('the signature is the letter’s own, or the sender’s name', () => {
    expect(words(profile({ signature: 'G. Trovato' })).signature).toBe('G. Trovato');
    expect(words(profile({ signature: '' })).signature).toBe('Giovanni Trovato');
  });
});

describe('the salutation comes from the catalogue, the name from the model', () => {
  const greeted = (recipient) =>
    words(profile({ recipient: { company: 'ActAI', name: 'Anna Weber', ...recipient } }))
      .salutation;

  // The neutral form, and the build names the form of address as missing (#174).
  test('a named recipient nobody said how to address is greeted by name', () => {
    expect(words(profile()).salutation).toBe('Dear Anna Weber,');
  });

  test('a recipient with a form of address is greeted by surname', () => {
    expect(greeted({ form: 'ms', surname: 'Weber' })).toBe('Dear Ms Weber,');
    expect(greeted({ name: 'Jonas Weber', form: 'mr', surname: 'Weber' })).toBe('Dear Mr Weber,');
  });

  test('a title takes the form the catalogue gives a titled recipient', () => {
    expect(greeted({ form: 'ms', title: 'Dr', surname: 'Weber' })).toBe('Dear Dr Weber,');
  });

  // Splitting "Anna Weber" would be guessing: without a surname the letter greets the name as written.
  test('a form of address without a surname is greeted by name, never by a surname cut from it', () => {
    expect(greeted({ form: 'ms' })).toBe('Dear Anna Weber,');
  });

  test('the neutral form greets the name as written, and leaves the title to it', () => {
    expect(greeted({ form: 'neutral', title: 'Dr', surname: 'Weber' })).toBe('Dear Anna Weber,');
  });

  // Nothing invents a name. Without one the letter opens the way the catalogue says.
  test('an unnamed recipient gets the anonymous opening, not an invented name', () => {
    expect(words(profile({ recipient: { company: 'ActAI' } })).salutation).toBe(
      'Dear Hiring Team,'
    );
  });
});

// The address block carries the form of address on the name's line (#182), worded by the catalogue from the form the
// model resolved. The line count the address zone limits does not change.
describe('the name line of the address block comes from the catalogue, the form from the model', () => {
  // A catalogue whose address block writes a form of address, as German's does.
  const wordings = {
    'cv:letter.addressMs': 'Frau {{name}}',
    'cv:letter.addressMr': 'Herrn {{name}}',
    'cv:letter.addressMsTitled': 'Frau {{title}} {{name}}',
    'cv:letter.addressMrTitled': 'Herrn {{title}} {{name}}'
  };
  const writing = (key, values = {}) =>
    key in wordings
      ? wordings[key].replace(/\{\{(\w+)\}\}/g, (placeholder, name) => values[name] ?? placeholder)
      : t(key, values);
  const addressed = (recipient, translate = writing) =>
    LetterContent.of(
      profile({ recipient: { company: 'ActAI', name: 'Anna Weber', ...recipient } }),
      { t: translate, locale: 'de' }
    ).letter.recipient;

  test('a recipient with a form of address is named by it, on the name’s own line', () => {
    expect(addressed({ form: 'ms', address: ['Chausseestraße 1'] })).toEqual([
      'ActAI',
      'Frau Anna Weber',
      'Chausseestraße 1'
    ]);
    expect(addressed({ name: 'Jonas Weber', form: 'mr' })).toEqual(['ActAI', 'Herrn Jonas Weber']);
  });

  test('a title takes the wording the catalogue gives a titled recipient', () => {
    expect(addressed({ form: 'ms', title: 'Dr.' })).toEqual(['ActAI', 'Frau Dr. Anna Weber']);
  });

  test('the neutral form, or none, leaves the name as written, its title with it', () => {
    expect(addressed({ form: 'neutral', title: 'Dr.' })).toEqual(['ActAI', 'Anna Weber']);
    expect(addressed({ title: 'Dr.' })).toEqual(['ActAI', 'Anna Weber']);
  });

  // A language whose address block carries no form of address says so with an empty wording: data, not code.
  test('an empty wording in the catalogue leaves the name as written', () => {
    const none = (key, values) => (key in wordings ? '' : t(key, values));

    expect(addressed({ form: 'ms', title: 'Dr.' }, none)).toEqual(['ActAI', 'Anna Weber']);
    expect(addressed({ form: 'mr' }, none)).toEqual(['ActAI', 'Anna Weber']);
  });
});

describe('the date is formatted, never spelled', () => {
  // AGENTS.md gives dates to Intl. A German letter dated in American order was not written for its reader.
  test('English and German render the same date differently', () => {
    expect(words(profile(), 'en').date).toMatch(/September 9, 2026|9 September 2026/);
    expect(words(profile(), 'de').date).toMatch(/9\. September 2026/);
  });

  // A German letter is dated from the city alone. The region and the country belong to the letterhead, which
  // keeps the whole location (#36).
  test('dates the letter from the city, and leaves the whole location to the letterhead', () => {
    const content = words(profile({}, { location: 'Bad Liebenstein, Thuringia, Germany' }), 'de');

    expect(content.date).toBe('Bad Liebenstein, 9. September 2026');
    expect(content.sender.contact).toContain('Bad Liebenstein, Thuringia, Germany ·');
  });

  test('an unparseable date is printed as written rather than dropped', () => {
    expect(words(profile({ date: 'next Tuesday' })).date).toBe('Bad Liebenstein, next Tuesday');
  });

  test('a letter the data did not date is not dated', () => {
    expect(words(profile({ date: '' })).date).toBe('');
  });

  // The review of #151: `Date` reads "September 16, 2026" as local midnight, so formatting it in UTC printed the 15th in
  // Berlin, and a time past midnight at +02:00 is the 15th in UTC anywhere. Only a bare calendar date is formatted.
  test.each([
    'September 16, 2026',
    '16 September 2026',
    '2026-09-16T00:30:00+02:00',
    '2026-02-30',
    '2026-9-16'
  ])('"%s" is not a bare calendar date, and is printed exactly as written', (date) => {
    expect(words(profile({ date }), 'en').date).toBe(`Bad Liebenstein, ${date}`);
    expect(words(profile({ date }), 'de').date).toBe(`Bad Liebenstein, ${date}`);
  });

  test('a bare calendar date is formatted for the letter’s language', () => {
    expect(words(profile({ date: '2026-09-16' }), 'en').date).toBe(
      'Bad Liebenstein, September 16, 2026'
    );
    expect(words(profile({ date: '2026-09-16' }), 'de').date).toBe(
      'Bad Liebenstein, 16. September 2026'
    );
    expect(words(profile({ date: '2024-02-29' }), 'de').date).toBe(
      'Bad Liebenstein, 29. Februar 2024'
    );
  });

  // Jest keeps the zone the run started in, so each zone gets a process of its own: 10 hours west of UTC, 14 east, and
  // the owner's.
  test.each(['Pacific/Honolulu', 'Pacific/Kiritimati', 'Europe/Berlin'])(
    'prints the same day in %s',
    (zone) => {
      const module = new URL('../core/LetterContent.js', import.meta.url).href;
      const dates = ['2026-09-16', 'September 16, 2026', '2026-09-16T00:30:00+02:00'];
      const script = `
        import { LetterContent } from ${JSON.stringify(module)};
        const letter = (date, locale) =>
          LetterContent.of({ name: 'Ada', location: 'Bad Liebenstein', letter: { date } }, { t: (key) => key, locale })
            .letter.date;
        const dates = ${JSON.stringify(dates)};
        console.log(JSON.stringify([
          new Date(2026, 8, 16).getTimezoneOffset(),
          ...dates.map((date) => letter(date, 'en')),
          letter('2026-09-16', 'de')
        ]));`;
      const [offset, ...printed] = JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          env: { ...process.env, TZ: zone },
          encoding: 'utf8'
        })
      );

      expect(offset).toBe(
        { 'Pacific/Honolulu': 600, 'Pacific/Kiritimati': -840, 'Europe/Berlin': -120 }[zone]
      );
      expect(printed).toEqual([
        'Bad Liebenstein, September 16, 2026',
        'Bad Liebenstein, September 16, 2026',
        'Bad Liebenstein, 2026-09-16T00:30:00+02:00',
        'Bad Liebenstein, 16. September 2026'
      ]);
    }
  );
});

describe('what travels with the letter', () => {
  test('the attachments are named after the catalogue’s word', () => {
    expect(words(profile({ attachments: ['CV', 'References'] })).attachments).toBe(
      'Enclosed: CV, References'
    );
  });

  test('a letter with no attachments says nothing about attachments', () => {
    const content = words(profile({ attachments: [] }));

    expect(content.attachments).toBe('');
    expect(readingOrder(content).join('\n')).not.toContain('Enclosed');
  });

  test('a letter with no closing sentence of its own still closes', () => {
    const content = words(profile({ closing: '' }));

    expect(content.closingSentence).toBe('');
    expect(content.closing).toBe('Kind regards,');
  });
});

// The catalogues the page loads, read as i18next reads a namespaced key. No profile the repository publishes is in
// German, so a German letter is checked here, on the words, rather than on a print.
describe('in the catalogues the page loads', () => {
  const namespacesOf = (locale) =>
    Object.fromEntries(
      ['ui', 'cv'].map((namespace) => [
        namespace,
        JSON.parse(
          readFileSync(new URL(`../locales/${locale}/${namespace}.json`, import.meta.url), 'utf8')
        )
      ])
    );
  // The print audit reads the catalogues with a translator of its own, and expects on the paper what it composes.
  const catalogue = (locale) => catalogueTranslator(namespacesOf(locale));
  // The page reads them with i18next, configured as core/I18nService.js configures it.
  const page = async (locale) => {
    const instance = i18next.createInstance();
    await instance.init({
      lng: locale,
      resources: { [locale]: namespacesOf(locale) },
      ns: ['ui', 'cv'],
      defaultNS: 'ui',
      interpolation: { escapeValue: false }
    });
    return (key, values) => instance.t(key, values);
  };

  test('a German letter opens, closes and lists its attachments in German', () => {
    const content = LetterContent.of(
      profile(
        { attachments: ['Lebenslauf', 'Zeugnisse'], subject: '' },
        { location: 'Bad Liebenstein, Thuringia, Germany' }
      ),
      { t: catalogue('de'), locale: 'de' }
    ).letter;

    expect(content).toMatchObject({
      date: 'Bad Liebenstein, 9. September 2026',
      subject: 'Bewerbung',
      salutation: 'Guten Tag Anna Weber,',
      closing: 'Mit freundlichen Grüßen',
      attachments: 'Anlagen: Lebenslauf, Zeugnisse'
    });
  });

  // The German reader does not accept "Sehr geehrte(r)" (#174): the form agrees with the person the author marked, or
  // the letter greets them neutrally. Both translators, so the page cannot print a line the audit does not expect.
  const anna = { company: 'Beispiel GmbH', name: 'Anna Schmidt', surname: 'Schmidt' };
  const jonas = { company: 'Beispiel GmbH', name: 'Jonas Schmidt', surname: 'Schmidt' };
  test.each([
    ['de', 'Frau, by surname', 'Sehr geehrte Frau Schmidt,', { ...anna, form: 'ms' }],
    ['de', 'Herr, by surname', 'Sehr geehrter Herr Schmidt,', { ...jonas, form: 'mr' }],
    [
      'de',
      'a titled Frau',
      'Sehr geehrte Frau Dr. Schmidt,',
      { ...anna, form: 'ms', title: 'Dr.' }
    ],
    [
      'de',
      'a titled Herr',
      'Sehr geehrter Herr Prof. Dr. Schmidt,',
      { ...jonas, form: 'mr', title: 'Prof. Dr.' }
    ],
    ['de', 'a neutral form', 'Guten Tag Anna Schmidt,', { ...anna, form: 'neutral' }],
    ['de', 'no form of address', 'Guten Tag Anna Schmidt,', anna],
    ['de', 'nobody named', 'Sehr geehrte Damen und Herren,', { company: 'Beispiel GmbH' }],
    ['en', 'Ms, by surname', 'Dear Ms Schmidt,', { ...anna, form: 'ms' }],
    ['en', 'Mr, by surname', 'Dear Mr Schmidt,', { ...jonas, form: 'mr' }],
    ['en', 'a titled Ms', 'Dear Dr Schmidt,', { ...anna, form: 'ms', title: 'Dr' }],
    ['en', 'a titled Mr', 'Dear Dr Schmidt,', { ...jonas, form: 'mr', title: 'Dr' }],
    ['en', 'a neutral form', 'Dear Anna Schmidt,', { ...anna, form: 'neutral' }],
    ['en', 'no form of address', 'Dear Anna Schmidt,', anna],
    ['en', 'nobody named', 'Dear Hiring Team,', { company: 'Beispiel GmbH' }]
  ])('in %s, %s is greeted "%s"', async (locale, what, salutation, recipient) => {
    const data = profile({ recipient });

    expect(LetterContent.of(data, { t: catalogue(locale), locale }).letter.salutation).toBe(
      salutation
    );
    expect(LetterContent.of(data, { t: await page(locale), locale }).letter.salutation).toBe(
      salutation
    );
  });

  // German writes the form of address in the accusative on the name's line, "Herrn Dr. Max Mustermann", as the Duden
  // and DIN 5008's examples do (#182). English writes none: the catalogue's wording is empty, and the name stands.
  test.each([
    ['de', 'Frau', 'Frau Anna Schmidt', { ...anna, form: 'ms' }],
    ['de', 'Herrn, in the accusative', 'Herrn Jonas Schmidt', { ...jonas, form: 'mr' }],
    ['de', 'a titled Frau', 'Frau Dr. Anna Schmidt', { ...anna, form: 'ms', title: 'Dr.' }],
    [
      'de',
      'a titled Herr',
      'Herrn Prof. Dr. Jonas Schmidt',
      { ...jonas, form: 'mr', title: 'Prof. Dr.' }
    ],
    ['de', 'a neutral form', 'Anna Schmidt', { ...anna, form: 'neutral', title: 'Dr.' }],
    ['de', 'no form of address', 'Anna Schmidt', anna],
    ['en', 'Ms', 'Anna Schmidt', { ...anna, form: 'ms' }],
    ['en', 'Mr', 'Jonas Schmidt', { ...jonas, form: 'mr' }],
    ['en', 'a titled Ms', 'Anna Schmidt', { ...anna, form: 'ms', title: 'Dr' }],
    ['en', 'a titled Mr', 'Jonas Schmidt', { ...jonas, form: 'mr', title: 'Dr' }],
    ['en', 'a neutral form', 'Anna Schmidt', { ...anna, form: 'neutral' }],
    ['en', 'no form of address', 'Anna Schmidt', anna]
  ])('in %s, the address block names %s "%s"', async (locale, what, line, recipient) => {
    const data = profile({
      recipient: { ...recipient, address: ['Musterstraße 12', '10115 Berlin'] }
    });
    const expected = ['Beispiel GmbH', line, 'Musterstraße 12', '10115 Berlin'];

    expect(LetterContent.of(data, { t: catalogue(locale), locale }).letter.recipient).toEqual(
      expected
    );
    expect(LetterContent.of(data, { t: await page(locale), locale }).letter.recipient).toEqual(
      expected
    );
  });

  // #182's acceptance: an English letter's address block is the one it printed before the form of address reached the
  // address. Royal Mail treats a title there as optional, so English writes none, and says so with empty wordings,
  // which i18next gives back as written, as the audit's translator does: the page and the audit print the bare name.
  test.each([
    ['a titled Ms', { form: 'ms', title: 'Dr' }],
    ['a titled Mr', { form: 'mr', title: 'Dr' }],
    ['a Ms', { form: 'ms' }],
    ['a Mr', { form: 'mr' }]
  ])('an English letter names %s as it did before', async (what, fields) => {
    const data = profile({
      recipient: { ...anna, ...fields, address: ['Musterstraße 12', '10115 Berlin'] }
    });
    const before = new CoverLetter(data.letter).recipientLines;

    expect(before).toEqual(['Beispiel GmbH', 'Anna Schmidt', 'Musterstraße 12', '10115 Berlin']);
    expect(namespacesOf('en').cv.letter).toMatchObject({
      addressMs: '',
      addressMr: '',
      addressMsTitled: '',
      addressMrTitled: ''
    });
    for (const t of [catalogue('en'), await page('en')]) {
      expect(LetterContent.of(data, { t, locale: 'en' }).letter.recipient).toEqual(before);
    }
  });

  test('no catalogue words a person with a bracketed ending', () => {
    const bracketed = [];
    const walk = (node, path) => {
      if (typeof node === 'string') {
        if (/\p{L}\((?:r|n|e|in|innen)\)/u.test(node)) bracketed.push(`${path}: ${node}`);
      } else if (node && typeof node === 'object') {
        Object.entries(node).forEach(([key, value]) => walk(value, `${path}.${key}`));
      }
    };
    for (const locale of readdirSync(new URL('../locales/', import.meta.url))) {
      for (const file of readdirSync(new URL(`../locales/${locale}/`, import.meta.url))) {
        const url = new URL(`../locales/${locale}/${file}`, import.meta.url);
        walk(JSON.parse(readFileSync(url, 'utf8')), `${locale}/${file}`);
      }
    }

    expect(bracketed).toEqual([]);
  });

  test.each([
    ['en', 'This profile carries no cover letter.'],
    ['de', 'Dieses Profil enthält kein Anschreiben.']
  ])('a profile without a letter is told so in %s', (locale, notice) => {
    expect(LetterContent.of({ name: 'Ada' }, { t: catalogue(locale), locale }).notice).toBe(notice);
  });
});

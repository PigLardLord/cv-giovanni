import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { LetterContent } from '../core/LetterContent.js';

// The words of a cover letter, decided once and read by the page that prints it and by the audit that checks
// the print (#151). pdfmake's `adapters/LetterLayout.js` decided them beside its geometry in points; these are
// its behavioural tests, carried over to the module that now decides.
const strings = {
  'cv:letter.subject': 'Application',
  'cv:letter.salutationNamed': 'Dear',
  'cv:letter.salutationAnonymous': 'Dear Hiring Team',
  'cv:letter.closing': 'Kind regards,',
  'cv:letter.attachments': 'Enclosed',
  'ui:letter.absent': 'This profile carries no cover letter.'
};
const t = (key) => strings[key] || key;

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
  test('a named recipient is addressed by name', () => {
    expect(words(profile()).salutation).toBe('Dear Anna Weber,');
  });

  // Nothing invents a name. Without one the letter opens the way the catalogue says.
  test('an unnamed recipient gets the anonymous opening, not an invented name', () => {
    expect(words(profile({ recipient: { company: 'ActAI' } })).salutation).toBe(
      'Dear Hiring Team,'
    );
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
  const catalogue = (locale) => {
    const namespaces = Object.fromEntries(
      ['ui', 'cv'].map((namespace) => [
        namespace,
        JSON.parse(
          readFileSync(new URL(`../locales/${locale}/${namespace}.json`, import.meta.url), 'utf8')
        )
      ])
    );
    return (key) => {
      const [namespace, path] = key.split(':');
      return path.split('.').reduce((value, part) => value?.[part], namespaces[namespace]) ?? key;
    };
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
      salutation: 'Sehr geehrte(r) Anna Weber,',
      closing: 'Mit freundlichen Grüßen',
      attachments: 'Anlagen: Lebenslauf, Zeugnisse'
    });
  });

  test.each([
    ['en', 'This profile carries no cover letter.'],
    ['de', 'Dieses Profil enthält kein Anschreiben.']
  ])('a profile without a letter is told so in %s', (locale, notice) => {
    expect(LetterContent.of({ name: 'Ada' }, { t: catalogue(locale), locale }).notice).toBe(notice);
  });
});

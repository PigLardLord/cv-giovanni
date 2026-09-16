import { ADDRESS_ZONE_LINES, CoverLetter, FORMS_OF_ADDRESS } from '../domain/CoverLetter.js';

const complete = {
  recipient: {
    name: 'Anna Weber',
    form: 'ms',
    surname: 'Weber',
    role: 'Talent Lead',
    company: 'ActAI',
    address: ['Chausseestraße 1', '10115 Berlin']
  },
  date: '2026-09-09',
  reference: 'REQ-1042',
  subject: 'Application for iOS Software Engineer',
  opening: 'I am writing about the iOS Software Engineer position.',
  body: [
    'Six years owning an enterprise MDM client.',
    'Swift 6 concurrency and iOS 26 migrations.'
  ],
  closing: 'I would welcome the chance to talk.',
  signature: 'Giovanni Trovato',
  attachments: ['Curriculum vitae']
};

describe('a complete letter', () => {
  const letter = new CoverLetter(complete);

  test('keeps what it was given', () => {
    expect(letter.recipient.company).toBe('ActAI');
    expect(letter.recipient.address).toEqual(['Chausseestraße 1', '10115 Berlin']);
    expect(letter.body).toHaveLength(2);
    expect(letter.reference).toBe('REQ-1042');
  });

  test('is complete, and says so', () => {
    expect(letter.isComplete).toBe(true);
    expect(letter.missing).toEqual([]);
  });

  test('offers its prose to whatever has to check what survived', () => {
    expect(letter.prose).toContain('Application for iOS Software Engineer');
    expect(letter.prose).toContain('Swift 6 concurrency');
  });
});

describe('a partial letter, which is the normal state', () => {
  // A letter is written once per application, so half-filled is the ordinary case rather than
  // the exception, and nothing here may crash on it.
  test('an empty letter is an empty letter, not a pile of undefined', () => {
    const letter = new CoverLetter();

    expect(letter.recipient.name).toBe('');
    expect(letter.body).toEqual([]);
    expect(letter.attachments).toEqual([]);
    expect(letter.prose).toBe('');
  });

  test('it names what it still needs, in the order a writer would fill them', () => {
    const letter = new CoverLetter({ recipient: { company: 'ActAI' }, subject: 'x' });

    expect(letter.isComplete).toBe(false);
    expect(letter.missing).toEqual(['opening', 'body', 'signature']);
  });

  // The rule that matters: nothing is invented. A letter addressed to nobody at a company
  // nobody named is worse than no letter, and the only honest thing to do is say so.
  test('a missing recipient is reported, never replaced', () => {
    const letter = new CoverLetter({ ...complete, recipient: { company: 'ActAI' } });

    expect(letter.addressee).toBeNull();
    expect(letter.recipient.name).toBe('');
    expect(letter.isComplete).toBe(true);
  });

  test('it says who is addressed and never how', () => {
    const source = JSON.stringify(new CoverLetter(complete));

    for (const wording of ['Dear', 'Sehr geehrte', 'Gentile', 'Hiring Team', 'Frau', 'Ms ']) {
      expect(source).not.toContain(wording);
    }
  });
});

// How a named recipient is greeted is the author's to write, never inferred from a first name (#174): "Sehr geehrte(r)"
// was the price of a model that knew only a name. The form is a code the catalogue words in each language, and the
// surname is its own field, since splitting a name is guessing.
describe('how the recipient is greeted', () => {
  const recipient = (fields) => new CoverLetter({ ...complete, recipient: fields });
  const named = { company: 'ActAI', name: 'Anna Schmidt' };

  test('the forms of address are codes, not words of any language', () => {
    expect(FORMS_OF_ADDRESS).toEqual(['ms', 'mr', 'neutral']);
  });

  test('keeps the form, the title and the surname as the data wrote them', () => {
    const letter = recipient({ ...named, form: ' ms ', title: ' Dr. ', surname: ' Schmidt ' });

    expect(letter.recipient).toMatchObject({ form: 'ms', title: 'Dr.', surname: 'Schmidt' });
  });

  test.each([
    ['ms', 'Anna Schmidt'],
    ['mr', 'Jonas Schmidt']
  ])('a recipient marked %s with a surname is greeted by that form', (form, name) => {
    const letter = recipient({ company: 'ActAI', name, form, surname: 'Schmidt' });

    expect(letter.greeting).toEqual({ form, name, surname: 'Schmidt', title: '' });
    expect(letter.problems).toEqual([]);
  });

  test('the title travels with the form', () => {
    expect(recipient({ ...named, form: 'ms', title: 'Dr.', surname: 'Schmidt' }).greeting).toEqual({
      form: 'ms',
      name: 'Anna Schmidt',
      surname: 'Schmidt',
      title: 'Dr.'
    });
  });

  test('the form is read whatever its case', () => {
    expect(recipient({ ...named, form: 'Mr', surname: 'Schmidt' }).greeting.form).toBe('mr');
  });

  test('a recipient the author marks neutral is greeted by name, and nothing is missing', () => {
    const letter = recipient({ ...named, form: 'neutral' });

    expect(letter.greeting.form).toBe('neutral');
    expect(letter.problems).toEqual([]);
  });

  // The neutral form is what a named recipient gets when nobody said how to address them, and the build says so.
  test('a named recipient with no form of address is greeted neutrally, and the form is named as missing', () => {
    const letter = recipient(named);

    expect(letter.greeting).toEqual({
      form: 'neutral',
      name: 'Anna Schmidt',
      surname: '',
      title: ''
    });
    expect(letter.missing).toEqual(['recipient.form']);
    expect(letter.problems).toEqual(['recipient.form: missing']);
    expect(letter.isComplete).toBe(false);
  });

  // A surname is never cut from the name: "Anna Maria Schmidt" and "Schmidt Anna" both exist.
  test('a form of address without a surname is greeted neutrally, and the surname is named as missing', () => {
    const letter = recipient({ ...named, form: 'ms' });

    expect(letter.greeting).toMatchObject({ form: 'neutral', surname: '' });
    expect(letter.problems).toEqual(['recipient.surname: missing']);
  });

  test('a form of address the model does not know is named with what was written', () => {
    const letter = recipient({ ...named, form: 'Frau', surname: 'Schmidt' });

    expect(letter.greeting.form).toBe('neutral');
    expect(letter.missing).toEqual(['recipient.form']);
    expect(letter.problems).toEqual(['recipient.form: "Frau" is not ms, mr or neutral']);
  });

  test('a neutral form with no name to greet falls back to the anonymous opening, and the name is missing', () => {
    const letter = recipient({ company: 'ActAI', form: 'neutral' });

    expect(letter.greeting.form).toBe('anonymous');
    expect(letter.problems).toEqual(['recipient.name: missing']);
  });

  test('a surname with no form of address is a person nobody said how to greet', () => {
    const letter = recipient({ company: 'ActAI', surname: 'Schmidt' });

    expect(letter.greeting.form).toBe('anonymous');
    expect(letter.problems).toEqual(['recipient.form: missing']);
  });

  // Nobody named, nobody to greet: the anonymous opening is not a fallback but the letter as written.
  test('a recipient nobody named is greeted anonymously, and needs no form of address', () => {
    const letter = recipient({ company: 'ActAI' });

    expect(letter.greeting).toEqual({ form: 'anonymous', name: '', surname: '', title: '' });
    expect(letter.problems).toEqual([]);
  });
});

describe('a body that arrives as one string', () => {
  test('blank lines are the paragraphs', () => {
    const letter = new CoverLetter({ body: 'First paragraph.\n\nSecond paragraph.\n\n\nThird.' });

    expect(letter.body).toEqual(['First paragraph.', 'Second paragraph.', 'Third.']);
  });

  test('whitespace is not content', () => {
    expect(new CoverLetter({ body: '   \n\n  ' }).body).toEqual([]);
    expect(new CoverLetter({ subject: '   ' }).subject).toBe('');
  });
});

// DIN 5008 form B's address zone holds six lines. A seventh prints on the row of the date, outside a window envelope's
// window, and the review of #151 found the build wrote such a letter without a word. The letter says so first.
describe('what a letter will not print well', () => {
  test('the address zone holds six lines', () => {
    expect(ADDRESS_ZONE_LINES).toBe(6);
  });

  test('the recipient is every line the data wrote, company first, in the order a window shows it', () => {
    expect(new CoverLetter(complete).recipientLines).toEqual([
      'ActAI',
      'Anna Weber',
      'Talent Lead',
      'Chausseestraße 1',
      '10115 Berlin'
    ]);
    expect(new CoverLetter({ recipient: { name: 'Anna Weber' } }).recipientLines).toEqual([
      'Anna Weber'
    ]);
  });

  test('a complete letter of six recipient lines has no problem', () => {
    const six = {
      ...complete,
      recipient: { ...complete.recipient, address: ['Haus 2', 'Chausseestraße 1', '10115 Berlin'] }
    };

    expect(new CoverLetter(six).recipientLines).toHaveLength(6);
    expect(new CoverLetter(six).problems).toEqual([]);
  });

  test('a seventh recipient line is a problem, and nothing is dropped to hide it', () => {
    const seven = {
      ...complete,
      recipient: {
        ...complete.recipient,
        address: ['Haus 2', 'Eingang B', 'Chausseestraße 1', '10115 Berlin']
      }
    };
    const letter = new CoverLetter(seven);

    expect(letter.problems).toEqual(['recipient: 7 lines, the address zone holds 6']);
    expect(letter.recipientLines).toHaveLength(7);
  });

  test('every field it still needs is a problem too, in the order a writer would fill them', () => {
    expect(new CoverLetter({ recipient: { company: 'ActAI' }, subject: 'x' }).problems).toEqual([
      'opening: missing',
      'body: missing',
      'signature: missing'
    ]);
  });
});

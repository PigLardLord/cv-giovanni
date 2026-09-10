import { CoverLetter } from '../domain/CoverLetter.js';

const complete = {
  recipient: { name: 'Anna Weber', role: 'Talent Lead', company: 'ActAI', address: ['Chausseestraße 1', '10115 Berlin'] },
  date: '2026-09-09',
  reference: 'REQ-1042',
  subject: 'Application for iOS Software Engineer',
  opening: 'I am writing about the iOS Software Engineer position.',
  body: ['Six years owning an enterprise MDM client.', 'Swift 6 concurrency and iOS 26 migrations.'],
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

    for (const wording of ['Dear', 'Sehr geehrte', 'Gentile', 'Hiring Team']) {
      expect(source).not.toContain(wording);
    }
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

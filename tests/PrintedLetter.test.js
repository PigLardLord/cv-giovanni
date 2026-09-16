import {
  catalogueTranslator,
  letterAnchors,
  marginsClear
} from '../scripts/lib/printed-letter.mjs';
import { outOfOrder } from '../scripts/lib/section-order.mjs';

// What the print audit asks of a cover letter printed from letter.html (#151). A letter is not a CV: it has one page,
// no sections, and a name that appears twice, so it is scored on checks of its own.
const letter = {
  sender: { name: 'Ada Lovelace', contact: 'London, United Kingdom · ada@example.com' },
  returnAddress: 'Ada Lovelace · London, United Kingdom',
  recipient: ['Beispiel GmbH', 'Anna Schmidt', 'Musterstraße 12', '10115 Berlin', 'United Kingdom'],
  date: 'London, September 16, 2026',
  reference: '12',
  subject: 'Application for Analyst at Beispiel GmbH',
  salutation: 'Dear Anna Schmidt,',
  paragraphs: ['I write about the analyst role.', 'I built an engine-agnostic notation.'],
  closingSentence: 'I would welcome a conversation.',
  closing: 'Kind regards,',
  signature: 'Ada Lovelace',
  attachments: 'Enclosed: CV'
};

const printed = [
  'Ada Lovelace',
  'London, United Kingdom · ada@example.com',
  'Ada Lovelace · London, United Kingdom',
  'Beispiel GmbH',
  'Anna Schmidt',
  'Musterstraße 12',
  '10115 Berlin',
  'United Kingdom',
  'London, September 16, 2026',
  '12',
  'Application for Analyst at Beispiel',
  'GmbH',
  'Dear Anna Schmidt,',
  'I write about the analyst role.',
  'I built an engine-agnostic',
  'notation.',
  'I would welcome a conversation.',
  'Kind regards,',
  'Ada Lovelace',
  'Enclosed: CV'
].join('\n');

describe("the parts of a printed letter, in a reader's order", () => {
  test('a letter read top to bottom has nothing out of order, across wrapped lines', () => {
    expect(outOfOrder(printed, letterAnchors(letter))).toEqual([]);
  });

  // A short reference the sender's own letterhead also writes, in a phone number, must not be found there.
  test('a line the letterhead also contains is not found there', () => {
    const contact = 'London, United Kingdom · ada@example.com · +44 20 7946 0012';
    const reachable = { ...letter, sender: { ...letter.sender, contact } };

    expect(letterAnchors(reachable)).toContainEqual({ heading: '12' });
    expect(
      outOfOrder(
        printed.replace('London, United Kingdom · ada@example.com', contact),
        letterAnchors(reachable)
      )
    ).toEqual([]);
    expect(
      outOfOrder(printed.replace('London, United Kingdom · ada@example.com', contact), [
        contact,
        'Beispiel GmbH',
        '12'
      ])
    ).toEqual(['"12" comes before "Beispiel GmbH"']);
  });

  test('names the subject drawn before the address', () => {
    const early = printed
      .replace('Application for Analyst at Beispiel\nGmbH\n', '')
      .replace('Beispiel GmbH\n', 'Application for Analyst at Beispiel\nGmbH\nBeispiel GmbH\n');

    expect(outOfOrder(early, letterAnchors(letter))).toContain(
      '"Application for Analyst at Beispiel GmbH" comes before "12"'
    );
  });

  test('names the signature drawn before the close', () => {
    const signedEarly = printed.replace(
      'Kind regards,\nAda Lovelace',
      'Ada Lovelace\nKind regards,'
    );

    expect(outOfOrder(signedEarly, letterAnchors(letter))).toContain(
      '"Ada Lovelace" comes before "Kind regards,"'
    );
  });

  test('asks nothing of a part the letter leaves out', () => {
    const bare = { ...letter, date: '', reference: '', closingSentence: '', attachments: '' };

    expect(letterAnchors(bare)).toEqual([
      'Ada Lovelace',
      'London, United Kingdom · ada@example.com',
      'Ada Lovelace · London, United Kingdom',
      'Beispiel GmbH',
      'Application for Analyst at Beispiel GmbH',
      'Dear Anna Schmidt,',
      'I write about the analyst role.',
      'I built an engine-agnostic notation.',
      { heading: 'Kind regards,' },
      { following: 'Ada Lovelace' }
    ]);
  });
});

describe('the catalogue the audit reads the letter in', () => {
  const t = catalogueTranslator({
    cv: { letter: { closing: 'Kind regards,' } },
    ui: { letter: { absent: 'No letter.' } }
  });

  test('reads a namespaced key as i18next does', () => {
    expect(t('cv:letter.closing')).toBe('Kind regards,');
    expect(t('ui:letter.absent')).toBe('No letter.');
  });

  test('gives back a key it cannot find, as i18next does', () => {
    expect(t('cv:letter.subject')).toBe('cv:letter.subject');
    expect(t('print:anything')).toBe('print:anything');
  });
});

// Form B is asymmetric by design, 24.1mm on the left and 20mm on the right, so a letter's sides are not compared,
// as a CV's are; every side has to clear the floor.
describe('the ink margins of a printed letter', () => {
  const box = (left, top, right, bottom) => ({ left, top, right, bottom });

  test('clear when every side of every page clears the floor', () => {
    expect(marginsClear([box(24.1, 19.8, 19.8, 48)], 10)).toBe(true);
  });

  test('fail on one side under the floor', () => {
    expect(marginsClear([box(24.1, 19.8, 9.9, 48)], 10)).toBe(false);
  });

  test('fail on a page with no ink measured at all', () => {
    expect(marginsClear([], 10)).toBe(false);
  });
});

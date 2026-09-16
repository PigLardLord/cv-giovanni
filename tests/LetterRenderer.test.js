import { JSDOM } from 'jsdom';
import { LetterRenderer } from '../renderers/LetterRenderer.js';

// The cover letter as a page, printed by Chrome like the CV (#151). The words are LetterContent's; the renderer
// only writes them, as text, in the order a reader meets them, so the printed text layer gives them in that order.
const words = {
  title: 'Ada Lovelace — Application for Analyst',
  notice: '',
  letter: {
    sender: { name: 'Ada Lovelace', contact: 'London · ada@example.com · +44 20 7946 0000' },
    returnAddress: 'Ada Lovelace · London',
    recipient: ['Beispiel GmbH', 'Anna Schmidt', 'Musterstraße 12', '10115 Berlin'],
    date: 'London, September 16, 2026',
    reference: 'REF-2026-17',
    subject: 'Application for Analyst',
    salutation: 'Dear Anna Schmidt,',
    paragraphs: ['I write about the analyst role.', 'I built an engine-agnostic notation.'],
    closingSentence: 'I would welcome a conversation.',
    closing: 'Kind regards,',
    signature: 'Ada Lovelace',
    attachments: 'Enclosed: CV'
  }
};

describe('LetterRenderer', () => {
  let document;
  const letter = () => document.getElementById('letter');
  const texts = (selector) =>
    [...letter().querySelectorAll(selector)].map((node) => node.textContent);

  beforeEach(() => {
    document = new JSDOM('<!DOCTYPE html><html><body><main id="letter"></main></body></html>')
      .window.document;
  });

  test('writes every part of the letter, in reading order', () => {
    new LetterRenderer().render(document, words);

    expect([...letter().querySelectorAll('h1, h2, p')].map((node) => node.textContent)).toEqual([
      'Ada Lovelace',
      'London · ada@example.com · +44 20 7946 0000',
      'Ada Lovelace · London',
      'Beispiel GmbH',
      'Anna Schmidt',
      'Musterstraße 12',
      '10115 Berlin',
      'London, September 16, 2026',
      'REF-2026-17',
      'Application for Analyst',
      'Dear Anna Schmidt,',
      'I write about the analyst role.',
      'I built an engine-agnostic notation.',
      'I would welcome a conversation.',
      'Kind regards,',
      'Ada Lovelace',
      'Enclosed: CV'
    ]);
  });

  // page-ready.mjs waits for the name in this element before it prints.
  test('names the sender in the letterhead, where the print waits for it', () => {
    new LetterRenderer().render(document, words);

    expect(document.getElementById('letter-name').textContent).toBe('Ada Lovelace');
    expect(document.title).toBe('Ada Lovelace — Application for Analyst');
  });

  // DIN 5008 geometry is fixed-height blocks in normal flow: each is there even when the data leaves it empty.
  test('keeps each block of the form, and writes no empty line into it', () => {
    new LetterRenderer().render(document, {
      ...words,
      letter: { ...words.letter, reference: '', date: '', attachments: '', closingSentence: '' }
    });

    for (const block of ['letter-head', 'letter-window', 'letter-dateline', 'letter-close']) {
      expect(letter().querySelectorAll(`.${block}`)).toHaveLength(1);
    }
    expect(letter().querySelector('.letter-dateline').children).toHaveLength(0);
    expect(texts('.letter-reference, .letter-date, .letter-attachments')).toEqual([]);
    expect(texts('.letter-close p')).toEqual(['Kind regards,', 'Ada Lovelace']);
  });

  // A letter is typed by a person or tailored by a model, never markup (#157).
  test('writes the words verbatim, never as markup', () => {
    new LetterRenderer().render(document, {
      ...words,
      letter: { ...words.letter, paragraphs: ['Cut crashes to <b>0.1%</b> at AT&T'] }
    });

    expect(texts('.letter-paragraph')).toEqual([
      'Cut crashes to <b>0.1%</b> at AT&T',
      'I would welcome a conversation.'
    ]);
    expect(letter().querySelectorAll('b')).toHaveLength(0);
  });

  // "engine-agnostic" broken at its hyphen extracts from the PDF as "engineagnostic".
  test('holds every hyphenated compound in a paragraph together', () => {
    new LetterRenderer().render(document, words);

    expect([...letter().querySelectorAll('.no-break')].map((node) => node.textContent)).toEqual([
      'engine-agnostic'
    ]);
  });

  test('a profile without a letter shows the notice, and no letter', () => {
    new LetterRenderer().render(document, {
      title: 'This profile carries no cover letter.',
      notice: 'This profile carries no cover letter.',
      letter: null
    });

    expect(texts('p')).toEqual(['This profile carries no cover letter.']);
    expect(document.getElementById('letter-name')).toBeNull();
  });

  test('rendering again replaces the letter rather than adding to it', () => {
    const renderer = new LetterRenderer();
    renderer.render(document, words);
    renderer.render(document, words);

    expect(letter().querySelectorAll('.letter-head')).toHaveLength(1);
  });

  test('handles a page without the letter element', () => {
    const empty = new JSDOM('<html><body></body></html>').window.document;

    expect(() => new LetterRenderer().render(empty, words)).not.toThrow();
  });
});

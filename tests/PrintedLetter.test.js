import {
  addressInWindow,
  bboxLines,
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

// DIN 5008 form B's address field is 85mm by 45mm, 45mm from the top edge and 20mm from the left: its upper 17.7mm hold
// the return line at their foot, its lower 27.3mm the recipient. A window envelope shows that field and nothing else,
// so a recipient printed anywhere else is a letter the post cannot deliver (#151).
describe('the address in the window', () => {
  const MM = 72 / 25.4;
  /** One line of `pdftotext -bbox-layout`, placed in millimetres and written in points, as poppler writes it. */
  const line = (text, top, left = 24.08, height = 4.27) => {
    const words = text.split(' ');
    const at = (mm) => (mm * MM).toFixed(6);
    return [
      `        <line xMin="${at(left)}" yMin="${at(top)}" xMax="${at(left + 3 * text.length)}" yMax="${at(top + height)}">`,
      ...words.map(
        (word) =>
          `          <word xMin="${at(left)}" yMin="${at(top)}" xMax="${at(left + 3)}" yMax="${at(top + height)}">${word
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')}</word>`
      ),
      '        </line>'
    ].join('\n');
  };
  const page = (...lines) =>
    [
      '<doc>',
      '  <page width="594.959960" height="841.919980">',
      '    <flow>',
      '      <block>',
      ...lines,
      '      </block>',
      '    </flow>',
      '  </page>',
      '</doc>'
    ].join('\n');
  const words = {
    returnAddress: 'Ada Lovelace · London',
    recipient: ['Beispiel GmbH', 'Anna Schmidt', 'Musterstraße 12 & Hof', '10115 Berlin']
  };
  const letterhead = [line('Ada Lovelace', 20), line('London · ada@example.com', 28)];
  const inWindow = page(
    ...letterhead,
    line('Ada Lovelace · London', 58.9, 24.08, 3.4),
    line('Beispiel GmbH', 62.8),
    line('Anna Schmidt', 67.3),
    line('Musterstraße 12 & Hof', 71.8),
    line('10115 Berlin', 76.3),
    line('London, September 16, 2026', 90.4, 125),
    line('Application for Analyst', 102.7)
  );

  test('reads each line of the first page, in millimetres, its words decoded', () => {
    const lines = bboxLines(inWindow);

    expect(lines[5].text).toBe('Musterstraße 12 & Hof');
    expect(lines[5].top).toBeCloseTo(71.8, 3);
    expect(lines[5].bottom).toBeCloseTo(76.07, 3);
    expect(lines[5].left).toBeCloseTo(24.08, 3);
    expect(lines).toHaveLength(9);
  });

  test('a return line at the foot of the upper zone and a recipient in the lower one are in the window', () => {
    expect(addressInWindow(bboxLines(inWindow), words)).toEqual([]);
  });

  // Where the layout put them before #151's review: the return line at 40mm and the recipient from 45mm.
  test('names every line printed above the window, and where it is', () => {
    const high = page(
      ...letterhead,
      line('Ada Lovelace · London', 41.4, 24.08, 3.2),
      line('Beispiel GmbH', 45.4),
      line('Anna Schmidt', 50.6),
      line('Musterstraße 12 & Hof', 55.9),
      line('10115 Berlin', 61.0)
    );

    expect(addressInWindow(bboxLines(high), words)).toEqual([
      '"Ada Lovelace · London" is 41.4–44.6mm from the top, outside 45–62.7mm',
      '"Beispiel GmbH" is 45.4–49.7mm from the top, outside 62.7–90mm',
      '"Anna Schmidt" is 50.6–54.9mm from the top, outside 62.7–90mm',
      '"Musterstraße 12 & Hof" is 55.9–60.2mm from the top, outside 62.7–90mm',
      '"10115 Berlin" is 61.0–65.3mm from the top, outside 62.7–90mm'
    ]);
  });

  test('names a seventh line that runs out of the bottom of the field', () => {
    const long = {
      ...words,
      recipient: [...words.recipient, 'Haus 2', 'Eingang B', 'Germany']
    };
    const overflowing = page(
      line('Ada Lovelace · London', 58.9, 24.08, 3.4),
      ...long.recipient.map((text, index) => line(text, 62.8 + index * 4.5))
    );

    expect(addressInWindow(bboxLines(overflowing), long)).toEqual([
      '"Germany" is 89.8–94.1mm from the top, outside 62.7–90mm'
    ]);
  });

  // A DL envelope's window runs from 20mm to 110mm across.
  test('names a line that runs past the side of the window', () => {
    const wide = page(
      line('Ada Lovelace · London', 58.9, 24.08, 3.4),
      line('Beispiel GmbH', 62.8, 15),
      line('Anna Schmidt', 67.3),
      line('Musterstraße 12 & Hof', 71.8, 60),
      line('10115 Berlin', 76.3)
    );

    expect(addressInWindow(bboxLines(wide), words)).toEqual([
      '"Beispiel GmbH" is 15.0–54.0mm from the left, outside 20–110mm',
      '"Musterstraße 12 & Hof" is 60.0–123.0mm from the left, outside 20–110mm'
    ]);
  });

  // A company name too long for one line wraps inside the field, and is still the address.
  test('follows a recipient line wrapped inside the field', () => {
    const wrapped = {
      ...words,
      recipient: ['Beispiel Gesellschaft für Software mbH', '10115 Berlin']
    };
    const lines = page(
      line('Ada Lovelace · London', 58.9, 24.08, 3.4),
      line('Beispiel Gesellschaft für', 62.8),
      line('Software mbH', 67.3),
      line('10115 Berlin', 71.8)
    );

    expect(addressInWindow(bboxLines(lines), wrapped)).toEqual([]);
  });

  test('names a return line or an address the page does not carry', () => {
    expect(addressInWindow(bboxLines(page(...letterhead)), words)).toEqual([
      'the return line "Ada Lovelace · London" is not on the page',
      'the address "Beispiel GmbH, Anna Schmidt, Musterstraße 12 & Hof, 10115 Berlin" is not on the page as lines of its own'
    ]);
  });

  test('a letter without a return line still has its address checked', () => {
    const bare = page(line('Beispiel GmbH', 45.4));

    expect(
      addressInWindow(bboxLines(bare), { returnAddress: '', recipient: ['Beispiel GmbH'] })
    ).toEqual(['"Beispiel GmbH" is 45.4–49.7mm from the top, outside 62.7–90mm']);
  });
});

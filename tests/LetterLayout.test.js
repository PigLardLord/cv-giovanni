import { LetterLayout } from '../adapters/LetterLayout.js';
import { CoverLetter } from '../domain/CoverLetter.js';
import { PdfDesignSystem } from '../adapters/PdfDesignSystem.js';
import { LayoutThemeRegistry } from '../adapters/LayoutThemeRegistry.js';

const MM = 72 / 25.4;
const format = { width: 595.28, height: 841.89 };
const theme = new LayoutThemeRegistry().resolve('nerd', 'color');
const typography = new PdfDesignSystem().resolve(theme);
const identity = {
  name: 'Giovanni Trovato',
  location: 'Bad Liebenstein',
  email: 'trovato.giovanni@gmail.com',
  phone: '+39 329 8484 046'
};
const strings = {
  'cv:letter.subject': 'Application',
  'cv:letter.salutationNamed': 'Dear',
  'cv:letter.salutationAnonymous': 'Dear Hiring Team',
  'cv:letter.closing': 'Kind regards,',
  'cv:letter.attachments': 'Enclosed'
};
const t = (key) => strings[key] || key;

const compose = (data, locale = 'en') => new LetterLayout().compose(
  new CoverLetter(data), { identity, format, theme, typography, t, locale }
);

const flatten = (node) => {
  if (node === null || node === undefined) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node === 'object') {
    return [...flatten(node.text), ...flatten(node.stack), ...flatten(node.columns)];
  }
  return [];
};

const letter = {
  recipient: { name: 'Anna Weber', role: 'Talent Lead', company: 'ActAI', address: ['Chausseestraße 1', '10115 Berlin'] },
  date: '2026-09-09',
  reference: 'REQ-1042',
  subject: 'Application for iOS Software Engineer',
  opening: 'I am writing about the iOS Software Engineer position.',
  body: ['Six years owning an enterprise MDM client.'],
  closing: 'I would welcome the chance to talk.',
  signature: 'Giovanni Trovato',
  attachments: ['Curriculum vitae']
};

describe('the page is a DIN 5008 letter', () => {
  const document = compose(letter);

  // The left margin is what makes an address line up in a window envelope. A letter that
  // ignores it is a letter someone has to re-fold.
  test('the margins are the standard, in points', () => {
    const [left, top, right, bottom] = document.pageMargins;

    expect(left).toBeCloseTo(24.1 * MM, 1);
    expect(right).toBeCloseTo(20 * MM, 1);
    expect(top).toBeCloseTo(20 * MM, 1);
    expect(bottom).toBeCloseTo(20 * MM, 1);
  });

  test('the address field is the width the standard gives it', () => {
    const block = document.content.find((node) => Array.isArray(node.columns));

    expect(block.columns[0].width).toBeCloseTo(85 * MM, 1);
  });

  test('it carries the CV typeface and theme it travels with', () => {
    expect(document.defaultStyle.font).toBe(typography.defaultStyle.font);
    expect(document.styles.meta.color).toBe(typography.styles.meta.color);
  });
});

describe('what the letter says', () => {
  const text = flatten(compose(letter).content).join('\n');

  test('the recipient, the company and the reference are all on the page', () => {
    expect(text).toContain('ActAI');
    expect(text).toContain('Anna Weber');
    expect(text).toContain('REQ-1042');
  });

  test('the sender can be written back to', () => {
    expect(text).toContain('trovato.giovanni@gmail.com');
  });

  // The name is deliberately not one of these: it appears in the sender line too, which is
  // correct on a letter and useless as a position marker.
  test('the subject, the body and the close are in reading order', () => {
    const order = ['ActAI', 'Application for iOS Software Engineer', 'Dear Anna Weber',
      'Six years owning', 'I would welcome', 'Kind regards', 'Enclosed'];
    const positions = order.map((fragment) => text.indexOf(fragment));

    expect(positions.every((at, index) => at >= 0 && (index === 0 || at > positions[index - 1]))).toBe(true);
  });
});

describe('the salutation comes from the catalogue, the name from the model', () => {
  test('a named recipient is addressed by name', () => {
    expect(flatten(compose(letter).content).join('\n')).toContain('Dear Anna Weber,');
  });

  // Nothing invents a name. Without one the letter opens the way the catalogue says.
  test('an unnamed recipient gets the anonymous opening, not an invented name', () => {
    const text = flatten(compose({ ...letter, recipient: { company: 'ActAI' } }).content).join('\n');

    expect(text).toContain('Dear Hiring Team,');
    expect(text).not.toContain('Dear ,');
  });
});

describe('the date is formatted, never spelled', () => {
  // AGENTS.md gives dates to Intl. A German letter dated in American order was not written
  // for its reader.
  test('English and German render the same date differently', () => {
    const english = flatten(compose(letter, 'en').content).join('\n');
    const german = flatten(compose(letter, 'de').content).join('\n');

    expect(english).toMatch(/September 9, 2026|9 September 2026/);
    expect(german).toMatch(/9\. September 2026/);
  });

  test('an unparseable date is printed as written rather than dropped', () => {
    expect(flatten(compose({ ...letter, date: 'next Tuesday' }).content).join('\n'))
      .toContain('next Tuesday');
  });
});

describe('the close holds together', () => {
  test('the signature cannot be orphaned onto another page', () => {
    const close = compose(letter).content.find((node) => node.unbreakable);

    expect(close).toBeDefined();
    expect(flatten(close).join(' ')).toContain('Giovanni Trovato');
  });

  test('a letter with no attachments says nothing about attachments', () => {
    expect(flatten(compose({ ...letter, attachments: [] }).content).join('\n'))
      .not.toContain('Enclosed');
  });
});

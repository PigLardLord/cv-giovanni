import { JSDOM } from 'jsdom';
import { SourceRenderer } from '../renderers/SourceRenderer.js';

const labels = {
  'source.marks.profile': 'Profile',
  'source.marks.contact': 'Contact',
  'source.card.mail': 'mail',
  'cv:contacts.email': 'Email',
  'cv:sections.skills': 'Core Technologies',
  'cv:sections.experience': 'Professional Experience',
  'cv:sections.languages': 'Languages'
};
const i18n = { t: (key) => labels[key] ?? key };

const profile = {
  name: 'Ada Lovelace',
  title: 'Senior iOS Engineer',
  email: 'ada@example.com',
  social: [{ platform: 'GitHub', url: 'https://github.com/ada' }],
  skills: [{ category: 'iOS', items: [{ name: 'Swift' }, { name: 'SwiftUI' }] }],
  relevant_experience: [
    {
      title: 'Mobile Engineer',
      company: 'Acme',
      location: 'Berlin',
      period: '2018 – Present',
      highlights: ['Cut CI time by 75%.']
    }
  ],
  languages: [{ name: 'Italian', level: 'Native' }]
};

describe('SourceRenderer', () => {
  let document;

  beforeEach(() => {
    document = new JSDOM(`<!doctype html><html><body>
      <div class="source-view" hidden>
        <ol id="source-outline"></ol>
        <p aria-hidden="true"><span data-source-file></span></p>
        <p aria-hidden="true"><span data-source-file></span></p>
        <div id="source-code"></div>
        <div class="simulator-screen"><img alt="" /><div id="source-card"></div></div>
      </div>
    </body></html>`).window.document;
  });

  const render = () => new SourceRenderer(i18n).render(document, profile);
  const code = () => document.getElementById('source-code');

  test('writes the syntax as drawing instructions and the CV as text', () => {
    render();

    // The stylesheet draws `let`, the quotes and the brackets from `data-code`. Nothing a reader
    // selects, a screen reader announces or a search matches ever contains them.
    const syntax = [...code().querySelectorAll('[data-code]')];
    expect(syntax.length).toBeGreaterThan(20);
    expect(syntax.every((span) => span.textContent === '')).toBe(true);
    expect(syntax.every((span) => span.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(syntax.map((span) => span.dataset.code)).toEqual(
      expect.arrayContaining(['let ', 'struct ', '"', 'title: ', '// MARK: - '])
    );

    expect(code().textContent).toContain('Ada Lovelace');
    expect(code().textContent).toContain('Cut CI time by 75%.');
    expect(code().textContent).not.toMatch(/\blet\b|struct|MARK|"|title:/);
  });

  test('keeps the document outline: the name, the sections and the roles are headings', () => {
    render();

    expect(code().querySelector('h1').textContent).toBe('Ada Lovelace');
    expect(
      [...code().querySelectorAll('h2')].map((heading) => [heading.id, heading.textContent])
    ).toEqual([
      ['source-profile', 'Profile'],
      ['source-contact', 'Contact'],
      ['source-skills', 'Core Technologies'],
      ['source-experience', 'Professional Experience'],
      ['source-languages', 'Languages']
    ]);
    expect([...code().querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
      'Mobile Engineer'
    ]);
  });

  test('gives each line its depth and marks the one the editor opens on', () => {
    render();

    const lines = [...code().querySelectorAll('.source-line')];
    const nameLine = lines.find((line) => line.querySelector('h1'));
    const highlight = lines.find((line) => line.textContent === 'Cut CI time by 75%.');

    expect(nameLine.dataset.depth).toBe('1');
    expect(nameLine.classList.contains('is-current')).toBe(true);
    expect(highlight.dataset.depth).toBe('3');
    expect(lines.filter((line) => line.classList.contains('is-current'))).toHaveLength(1);
  });

  test('numbers every line with a counter the reader never selects', () => {
    render();

    const lines = [...code().querySelectorAll('.source-line')];
    const numbers = lines.map((line) => line.querySelector('.source-number'));
    expect(numbers.every((number) => number && number.getAttribute('aria-hidden') === 'true')).toBe(
      true
    );
    expect(numbers.every((number) => number.textContent === '')).toBe(true);
  });

  test('keeps a link followable, and opens it without handing over the page', () => {
    render();

    const link = code().querySelector('a');
    expect(link.textContent).toBe('github.com/ada');
    expect(link.getAttribute('href')).toBe('https://github.com/ada');
    expect(link.rel).toBe('noopener noreferrer');
  });

  test('fills the navigator with a link to every section it wrote', () => {
    render();

    expect(
      [...document.querySelectorAll('#source-outline li > a')].map((link) => [
        link.getAttribute('href'),
        link.textContent
      ])
    ).toEqual([
      ['#source-profile', 'Profile'],
      ['#source-contact', 'Contact'],
      ['#source-skills', 'Core Technologies'],
      ['#source-experience', 'Professional Experience'],
      ['#source-languages', 'Languages']
    ]);
  });

  test('names the file wherever the editor shows it', () => {
    render();

    expect(
      [...document.querySelectorAll('[data-source-file]')].map((slot) => slot.textContent)
    ).toEqual(['AdaLovelace.swift', 'AdaLovelace.swift']);
  });

  test('draws the preview as a contact card nobody selects or hears twice', () => {
    render();

    // The card repeats the name, the role and the address the file already holds as text, so it
    // is a picture of an app: hidden from assistive technology, and every word drawn from
    // `data-text` rather than written into the document.
    const card = document.getElementById('source-card');
    expect(card.getAttribute('aria-hidden')).toBe('true');
    expect(card.textContent).toBe('');
    expect(card.querySelector('.app-name').dataset.text).toBe('Ada Lovelace');
    expect(card.querySelector('.app-title').dataset.text).toBe('Senior iOS Engineer');
    expect(
      [...card.querySelectorAll('.app-action')].map((action) => [
        action.dataset.icon,
        action.dataset.text
      ])
    ).toEqual([
      ['mail', 'mail'],
      ['link', 'GitHub']
    ]);
    expect(
      [...card.querySelectorAll('.app-row')].map((row) => [
        row.dataset.kind,
        row.querySelector('.app-row-label').dataset.text,
        row.querySelector('.app-row-value').dataset.text
      ])
    ).toEqual([['email', 'Email', 'ada@example.com']]);
  });

  test('renders again without writing the file or the card twice', () => {
    render();
    const once = code().querySelectorAll('.source-line').length;
    render();

    expect(code().querySelectorAll('.source-line')).toHaveLength(once);
    expect(document.querySelectorAll('#source-outline li')).toHaveLength(5);
    expect(document.querySelectorAll('#source-card .app-name')).toHaveLength(1);
  });

  test('does nothing on a page without the editor', () => {
    document.body.innerHTML = '';

    expect(() => render()).not.toThrow();
  });
});

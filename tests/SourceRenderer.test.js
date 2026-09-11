import { JSDOM } from 'jsdom';
import { SourceRenderer } from '../renderers/SourceRenderer.js';

const labels = {
  'source.marks.profile': 'Profile',
  'source.marks.contact': 'Contact',
  'source.card.mail': 'mail',
  'source.card.mailName': 'Email {{value}}',
  'source.card.call': 'call',
  'source.card.callName': 'Call {{value}}',
  'source.card.callJoke': 'Dial it on your own phone, lazybones.',
  'source.card.callDismiss': 'OK',
  'cv:contacts.phone': 'Phone',
  'cv:contacts.email': 'Email',
  'cv:sections.skills': 'Core Technologies',
  'cv:sections.experience': 'Professional Experience',
  'cv:sections.languages': 'Languages'
};
const i18n = {
  t: (key, options = {}) => (labels[key] ?? key).replace('{{value}}', options.value ?? '')
};

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
        <dialog id="source-call">
          <h2 id="source-call-title"></h2>
          <p id="source-call-message"></p>
          <form method="dialog"><button id="source-call-dismiss"></button></form>
        </dialog>
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

  test('copies a line of names as a list, and a language as a name and its level', () => {
    render();

    const lines = [...code().querySelectorAll('.source-line')].map((line) => line.textContent);
    expect(lines).toContain('Swift, SwiftUI');
    expect(lines).toContain('Italian: Native');
    expect(lines).toContain('GitHub, github.com/ada');
  });

  test('keeps the document outline: the name first, then the sections and the roles', () => {
    render();

    expect(code().querySelector('h1, h2, h3').tagName).toBe('H1');
    expect(code().querySelector('h1').textContent).toBe('Ada Lovelace');
    expect(
      [...code().querySelectorAll('h2')].map((heading) => [heading.id, heading.textContent])
    ).toEqual([
      ['source-experience', 'Professional Experience'],
      ['source-skills', 'Core Technologies'],
      ['source-languages', 'Languages'],
      ['source-contact', 'Contact']
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

  test('keeps a profile link followable, and opens it without handing over the page', () => {
    render();

    const link = code().querySelector('a[href^="https://github.com"]');
    expect(link.textContent).toBe('github.com/ada');
    expect(link.rel).toBe('noopener noreferrer');
  });

  test('makes the email address a link that writes a mail', () => {
    render();

    const mail = code().querySelector('a[href="mailto:ada@example.com"]');
    expect(mail.textContent).toBe('ada@example.com');
    expect(mail.hasAttribute('target')).toBe(false);
  });

  test('fills the navigator with a link to every section it wrote', () => {
    render();

    expect(
      [...document.querySelectorAll('#source-outline li > a')].map((link) => [
        link.getAttribute('href'),
        link.textContent
      ])
    ).toEqual([
      ['#source-experience', 'Professional Experience'],
      ['#source-skills', 'Core Technologies'],
      ['#source-languages', 'Languages'],
      ['#source-contact', 'Contact']
    ]);
  });

  test('draws the file name wherever the editor shows it, so a selection starts at the CV', () => {
    render();

    const slots = [...document.querySelectorAll('[data-source-file]')];
    expect(slots.map((slot) => slot.dataset.text)).toEqual([
      'AdaLovelace.swift',
      'AdaLovelace.swift'
    ]);
    expect(slots.every((slot) => slot.textContent === '')).toBe(true);
  });

  test('draws the card as a picture, with actions that are real links', () => {
    render();

    // The card repeats the name, the role and the addresses the file already holds as text, so
    // its words are drawn from `data-text` and nobody hears them twice. What looks like a button
    // is one: each action is a link with a name of its own, outside anything `aria-hidden`.
    const card = document.getElementById('source-card');
    expect(card.hasAttribute('aria-hidden')).toBe(false);
    expect(card.textContent).toBe('');

    const name = card.querySelector('.app-name');
    expect([name.dataset.text, name.getAttribute('aria-hidden')]).toEqual(['Ada Lovelace', 'true']);
    expect(card.querySelector('.app-title').dataset.text).toBe('Senior iOS Engineer');

    expect(
      [...card.querySelectorAll('.app-action')].map((action) => [
        action.tagName,
        action.getAttribute('href'),
        action.getAttribute('aria-label'),
        action.dataset.icon,
        action.dataset.text,
        action.closest('[aria-hidden]')
      ])
    ).toEqual([
      ['A', 'mailto:ada@example.com', 'Email ada@example.com', 'mail', 'mail', null],
      ['A', 'https://github.com/ada', 'GitHub', 'link', 'GitHub', null]
    ]);
  });

  test('keeps the card’s details tappable without reading them out a second time', () => {
    render();

    const rows = document.querySelector('#source-card .app-rows');
    expect(rows.getAttribute('aria-hidden')).toBe('true');
    expect(
      [...rows.querySelectorAll('.app-row')].map((row) => {
        const value = row.querySelector('.app-row-value');
        return [
          row.dataset.kind,
          row.querySelector('.app-row-label').dataset.text,
          value.tagName,
          value.getAttribute('href'),
          value.getAttribute('tabindex'),
          value.dataset.text
        ];
      })
    ).toEqual([['email', 'Email', 'A', 'mailto:ada@example.com', '-1', 'ada@example.com']]);
  });

  test('answers a tap on call with an alert: the number, and a nudge to dial it yourself', () => {
    // The candidate's easter egg. It is a real dialog, so it takes focus, is announced and closes
    // on Escape, and the button says what it opens.
    new SourceRenderer(i18n).render(document, { ...profile, phone: '+49 30 1234' });

    const call = document.querySelector('#source-card .app-action[data-icon="phone"]');
    expect([
      call.tagName,
      call.getAttribute('type'),
      call.getAttribute('aria-haspopup'),
      call.getAttribute('aria-controls'),
      call.getAttribute('aria-label'),
      call.dataset.text
    ]).toEqual(['BUTTON', 'button', 'dialog', 'source-call', 'Call +49 30 1234', 'call']);
    expect(document.getElementById('source-call-title').textContent).toBe('+49 30 1234');
    expect(document.getElementById('source-call-message').textContent).toBe(
      'Dial it on your own phone, lazybones.'
    );
    expect(document.getElementById('source-call-dismiss').textContent).toBe('OK');

    call.click();
    expect(document.getElementById('source-call').open).toBe(true);
  });

  test('renders again without writing the file or the card twice', () => {
    render();
    const once = code().querySelectorAll('.source-line').length;
    render();

    expect(code().querySelectorAll('.source-line')).toHaveLength(once);
    expect(document.querySelectorAll('#source-outline li')).toHaveLength(4);
    expect(document.querySelectorAll('#source-card .app-name')).toHaveLength(1);
  });

  test('does nothing on a page without the editor', () => {
    document.body.innerHTML = '';

    expect(() => render()).not.toThrow();
  });
});

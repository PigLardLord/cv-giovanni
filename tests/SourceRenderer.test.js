import { JSDOM } from 'jsdom';
import { SourceRenderer } from '../renderers/SourceRenderer.js';
import { fedTheModel } from './support/model.js';

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

  const render = () => fedTheModel(new SourceRenderer(i18n)).render(document, profile);
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
    fedTheModel(new SourceRenderer(i18n)).render(document, { ...profile, phone: '+49 30 1234' });

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

describe('SourceRenderer — the section in view', () => {
  let dom;
  let document;
  let window;

  // The editor as the page has it: the navigator's links, the pinned tab row, and the file.
  beforeEach(() => {
    dom = new JSDOM(
      `<!doctype html><html><body>
      <div class="source-view">
        <nav class="source-navigator"><ol id="source-outline"></ol></nav>
        <div class="source-editor">
          <p class="source-tabs" aria-hidden="true"><span data-source-file></span></p>
          <div id="source-code"></div>
        </div>
        <div class="simulator-screen"><img alt="" /><div id="source-card"></div></div>
      </div>
    </body></html>`,
      { url: 'http://localhost/index.html?layout=nerd' }
    );
    document = dom.window.document;
    window = dom.window;
  });

  const render = () => fedTheModel(new SourceRenderer(i18n)).render(document, profile);
  const place = (element, rect) => {
    element.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, ...rect });
  };
  // The pinned tab row ends 88px down the window; a heading counts as reached once its top is at
  // the line a jump from the navigator would land it on.
  const scrollTo = (tops) => {
    place(document.querySelector('.source-tabs'), { top: 52, bottom: 88 });
    document
      .querySelectorAll('#source-code h2[id]')
      .forEach((heading, index) => place(heading, { top: tops[index] }));
    window.dispatchEvent(new window.Event('scroll'));
  };
  const marked = () =>
    [...document.querySelectorAll('#source-outline a[aria-current]')].map((link) => [
      link.getAttribute('href'),
      link.getAttribute('aria-current')
    ]);

  test('marks the section whose heading was last scrolled past, and only that one', () => {
    render();
    scrollTo([-900, -200, 400, 1300]);

    expect(marked()).toEqual([['#source-skills', 'location']]);
  });

  // A jump from the navigator lands the heading 12px below the pinned rows, not at their edge,
  // so the section a reader just jumped to is the one marked.
  test('marks the section a jump just landed on', () => {
    render();
    scrollTo([-900, -200, 100, 1300]);

    expect(marked()).toEqual([['#source-languages', 'location']]);
  });

  test('marks nothing while the reader is still above the first section', () => {
    render();
    scrollTo([700, 1400, 2100, 2800]);

    expect(marked()).toEqual([]);
  });

  test('moves the mark as the file scrolls', () => {
    render();
    scrollTo([-900, -200, 400, 1300]);
    scrollTo([-1800, -1100, -500, 60]);

    expect(marked()).toEqual([['#source-contact', 'location']]);
  });

  const endOfFile = (atEnd) => {
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: atEnd ? 4100 : 0, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 5000,
      configurable: true
    });
  };

  // The last sections end the page before their headings can reach the pinned row. A jump to one of
  // them has to mark it anyway, or the mark stays on the section before it.
  test('at the end of the file, marks the section a jump went to though its heading cannot reach the top', () => {
    render();
    endOfFile(true);
    window.location.hash = '#source-contact';
    scrollTo([-1800, -1100, -500, 300]);

    expect(marked()).toEqual([['#source-contact', 'location']]);
  });

  test('a jump the reader has scrolled away from no longer holds the mark', () => {
    render();
    endOfFile(false);
    window.location.hash = '#source-contact';
    scrollTo([-900, -200, 400, 1300]);

    expect(marked()).toEqual([['#source-skills', 'location']]);
  });

  // Two sections already on screen at the foot of the page: a jump between them scrolls nothing, so
  // only the change of address can move the mark.
  test('a jump between two sections already on screen moves the mark without a scroll', () => {
    render();
    endOfFile(true);
    scrollTo([-1800, -1100, 200, 300]);
    window.location.hash = '#source-languages';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));

    expect(marked()).toEqual([['#source-languages', 'location']]);
  });

  // Below a laptop the links sit in one row that scrolls sideways: here 160px links, 180px apart, in
  // a row 300px wide, so only the first link is wholly in view.
  const rowOfLinks = () => {
    const bar = document.querySelector('.source-navigator');
    Object.defineProperty(bar, 'clientWidth', { value: 300 });
    Object.defineProperty(bar, 'scrollLeft', { value: 0, writable: true });
    document.querySelectorAll('#source-outline a').forEach((link, index) => {
      Object.defineProperty(link, 'offsetLeft', { value: index * 180 });
      Object.defineProperty(link, 'offsetWidth', { value: 160 });
    });
    return bar;
  };

  // The marked link is brought into the row's view, or the mark would point at something the reader
  // cannot see.
  test('keeps the marked link in view inside the row of links', () => {
    render();
    const bar = rowOfLinks();
    scrollTo([-1800, -1100, -500, 60]);

    expect(bar.scrollLeft).toBe(540 + 160 - 300);
  });

  // A keyboard reader moving along the row has the link they are on in view. Scrolling the file must
  // not pull the row out from under that focus; the mark still moves.
  test('keeps a link with keyboard focus in view while the mark moves on', () => {
    render();
    const bar = rowOfLinks();
    document.querySelector('#source-outline a').focus();
    scrollTo([-1800, -1100, -500, 60]);

    expect(bar.scrollLeft).toBe(0);
    expect(marked()).toEqual([['#source-contact', 'location']]);
  });

  // An address typed by hand can be malformed. It must not stop the mark following the page.
  test('a malformed address leaves the mark to the scroll position', () => {
    render();
    endOfFile(true);
    window.location.hash = '#%';
    scrollTo([-900, -200, 400, 1300]);

    expect(marked()).toEqual([['#source-skills', 'location']]);
  });

  // A browser fires many scroll events a frame. The mark is worked out once, on the next frame, and a
  // scroll after that frame asks for one of its own.
  test('works the mark out once a frame, however many events arrive before it', () => {
    const frames = [];
    window.requestAnimationFrame = (callback) => frames.push(callback);
    render();
    scrollTo([-900, -200, 400, 1300]);
    window.dispatchEvent(new window.Event('scroll'));
    window.dispatchEvent(new window.Event('resize'));

    expect(frames).toHaveLength(1);
    expect(marked()).not.toEqual([['#source-skills', 'location']]);

    frames.shift()();
    expect(marked()).toEqual([['#source-skills', 'location']]);

    scrollTo([-1800, -1100, -500, 60]);
    expect(frames).toHaveLength(1);
    frames.shift()();
    expect(marked()).toEqual([['#source-contact', 'location']]);
  });
});

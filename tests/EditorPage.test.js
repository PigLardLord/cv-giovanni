/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { EditorPage } from '../editor/EditorPage.js';

// The editor page (#23): the general profile as a form, beside the CV it renders. The page decides nothing
// about a profile — ProfileForm builds the form and makes each change, ProfileShape says what is wrong, the
// local API saves — so what these tests hold it to is the DOM: every field shown, every change saved, every
// problem beside its field, and the preview showing what was saved.
const page = readFileSync(new URL('../editor.html', import.meta.url), 'utf8');
const profile = JSON.parse(
  readFileSync(new URL('../profiles/general/en.json', import.meta.url), 'utf8')
);
const catalogue = {
  layouts: { nerd: 'Nerd Mode', spotlight: 'Impact Spotlight', technical: 'Technical Profile' }
};

/** The local API and the site's files, answering as told, and remembering every request. */
const server = ({
  load = { status: 200, body: profile },
  save = { status: 200, body: {} }
} = {}) => {
  const requests = [];
  const respond = ({ status, body }) => ({
    ok: status < 400,
    status,
    json: async () => JSON.parse(JSON.stringify(body))
  });
  return {
    requests,
    fetch: async (url, init = {}) => {
      requests.push({
        url,
        method: init.method || 'GET',
        body: init.body && JSON.parse(init.body)
      });
      if (url === 'api/profile') return respond(init.method === 'PUT' ? save : load);
      if (url === 'config/cv-manifest.json') {
        return respond({ status: 200, body: { layouts: ['nerd', 'spotlight', 'technical'] } });
      }
      if (url === 'locales/en/ui.json') return respond({ status: 200, body: catalogue });
      return respond({ status: 404, body: {} });
    }
  };
};

const editors = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.stop()));

const open = async (options) => {
  document.documentElement.innerHTML = page
    .replace(/^[\s\S]*?<html[^>]*>/i, '')
    .replace(/<\/html>\s*$/i, '');
  const api = server(options);
  const editor = new EditorPage({ document, window, fetch: api.fetch });
  editors.push(editor);
  await editor.start();
  return { api, editor };
};
const field = (path) => document.querySelector(`[data-path="${path}"]`);
const type = (path, value) => {
  const input = field(path);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const button = (name) =>
  [...document.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name
  );
const status = () => document.querySelector('[data-editor-status]').textContent;
const preview = () => document.querySelector('[data-editor-preview]').getAttribute('src');
const puts = (api) => api.requests.filter(({ method }) => method === 'PUT');

describe('the editor page', () => {
  test('shows every field of the profile with its value, and the CV beside it', async () => {
    await open();

    expect(field('name').value).toBe(profile.name);
    expect(field('relevant_experience[0].period').value).toBe(
      profile.relevant_experience[0].period
    );
    expect(field('relevant_experience[0].highlights[0]').tagName).toBe('TEXTAREA');
    expect(field('portfolio').value).toBe('');
    expect(document.querySelector(`label[for="${field('name').id}"]`).textContent).toMatch(/Name/);
    expect(preview()).toBe('index.html?layout=nerd&revision=0');
    const layouts = [...document.querySelectorAll('[data-editor-layouts] button')];
    expect(layouts.map((layout) => layout.textContent)).toEqual([
      'Nerd Mode',
      'Impact Spotlight',
      'Technical Profile'
    ]);
    expect(layouts.map((layout) => layout.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false'
    ]);
  });

  test('saves what was typed, and the preview shows the saved CV', async () => {
    const { api, editor } = await open();

    type('title', 'Staff iOS Engineer');
    await editor.save();

    expect(puts(api)).toEqual([
      { url: 'api/profile', method: 'PUT', body: { ...profile, title: 'Staff iOS Engineer' } }
    ]);
    expect(status()).toMatch(/Saved/);
    expect(preview()).toBe('index.html?layout=nerd&revision=1');
  });

  test('adds, moves and removes entries, and saves the list as it stands', async () => {
    const { api, editor } = await open();

    button('Add interest').click();
    type('interests[6]', 'Sailing');
    button('Move interest 7 up').click();
    button('Remove interest 1').click();
    await editor.save();

    expect(puts(api)[0].body.interests).toEqual([
      ...profile.interests.slice(1, 5),
      'Sailing',
      profile.interests[5]
    ]);
  });

  test('a list inside an entry names the entry it belongs to', async () => {
    const { api, editor } = await open();

    const next = profile.relevant_experience[1].highlights.length;
    button('Add highlight to role 2').click();
    type(`relevant_experience[1].highlights[${next}]`, 'Shipped offline-first sync');
    await editor.save();

    expect(puts(api)[0].body.relevant_experience[1].highlights.at(-1)).toBe(
      'Shipped offline-first sync'
    );
    expect(button('Remove highlight 1 of role 1')).toBeDefined();
  });

  test('a problem found before saving is marked beside its field, and nothing is sent', async () => {
    const { api, editor } = await open();

    type('relevant_experience[1].period', 'September 2015 – July 2018 (3 years)');
    await editor.save();

    expect(puts(api)).toEqual([]);
    const input = field('relevant_experience[1].period');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toMatch(
      /duration/
    );
    expect(document.activeElement).toBe(input);
    expect(status()).toMatch(/Not saved/);
  });

  test('a problem the server finds is marked the same way', async () => {
    const { editor } = await open({
      save: {
        status: 422,
        body: {
          error: 'The profile cannot be saved: email is refused.',
          problems: [{ path: 'email', reason: 'is refused' }]
        }
      }
    });

    await editor.save();

    expect(field('email').getAttribute('aria-invalid')).toBe('true');
    expect(status()).toMatch(/Not saved: The profile cannot be saved/);
    expect(preview()).toBe('index.html?layout=nerd&revision=0');
  });

  test('without the run’s key, the editor says how to open it and shows no form', async () => {
    await open({ load: { status: 404, body: {} } });

    expect(document.querySelector('[data-editor-form]').children).toHaveLength(0);
    expect(status()).toMatch(/key/);
  });

  test('the preview follows the layout picked', async () => {
    await open();

    button('Impact Spotlight').click();

    expect(preview()).toBe('index.html?layout=spotlight&revision=0');
    expect(button('Impact Spotlight').getAttribute('aria-pressed')).toBe('true');
  });

  test('the save button saves', async () => {
    const { api } = await open();

    document.querySelector('[data-editor-save]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(puts(api)).toHaveLength(1);
  });

  test('leaving with changes not saved asks first, and after saving does not', async () => {
    const { editor } = await open();
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(leave()).toBe(false);
    type('title', 'Staff iOS Engineer');
    expect(leave()).toBe(true);
    await editor.save();
    expect(leave()).toBe(false);
  });
});

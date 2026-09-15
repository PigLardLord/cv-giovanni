import { ProfileForm } from '../core/ProfileForm.js';
import { ProfileShape } from '../core/ProfileShape.js';

const NO_KEY =
  'The editor needs this run’s key: open the editor from the address npm run serve printed, the one ending in ?key=.';

/** A field's path as an element id: `relevant_experience[1].period` is `field-relevant_experience-1-period`. */
const idOf = (path) => `field-${path.replace(/[^A-Za-z0-9_]+/g, '-').replace(/-+$/, '')}`;
const problemCount = (problems) =>
  problems.length === 1 ? 'one problem' : `${problems.length} problems`;

/**
 * The editor page (#23): the general profile as a form, beside the CV it renders.
 *
 * The page decides nothing about a profile. `ProfileForm` builds the form and makes every change, returning a
 * new profile; `ProfileShape` says what is wrong, before anything is sent; the local API saves, and says what
 * it refused. What is here is the DOM: fields out, typing and clicks in, problems beside the fields they are
 * about, and the preview — the site's own page, not an imitation of it — reloaded once a save is written.
 * Everything a person typed goes into the page as text, never as markup.
 */
export class EditorPage {
  /**
   * @param {{ document: Document, window: Window, fetch: Function }} environment - Where the page runs, and how
   *   it reaches the local API
   */
  constructor({ document, window, fetch }) {
    this.document = document;
    this.window = window;
    this.fetch = fetch;
    this.profile = null;
    this.problems = [];
    this.layouts = [];
    this.layout = null;
    this.revision = 0;
    this.unsaved = false;
    // Leaving with changes not saved asks first.
    this.leaving = (event) => {
      if (this.unsaved) event.preventDefault();
    };
  }

  /** Stops asking before the page is left: for a page taken down without being left. */
  stop() {
    this.window.removeEventListener('beforeunload', this.leaving);
  }

  /** Loads the profile and the layouts, and shows the form beside the preview. */
  async start() {
    this.document.querySelector('[data-editor-save]').addEventListener('click', () => this.save());
    this.window.addEventListener('beforeunload', this.leaving);

    const response = await this.fetch('api/profile', { credentials: 'same-origin' });
    if (!response.ok) {
      this.say(
        response.status === 404
          ? NO_KEY
          : `The profile could not be loaded: the server answered ${response.status}.`
      );
      return;
    }
    this.profile = await response.json();
    this.problems = ProfileShape.problems(this.profile);
    this.layouts = await this.loadLayouts();
    this.layout = this.layouts[0]?.id ?? null;
    this.renderPreview();
    this.render();
    if (this.problems.length) {
      this.say(`The profile on disk has ${problemCount(this.problems)}, marked beside the fields.`);
    }
  }

  /** The layouts the site has, named as its own switcher names them. */
  async loadLayouts() {
    const read = async (url) => {
      const response = await this.fetch(url, { credentials: 'same-origin' });
      return response.ok ? response.json() : null;
    };
    const [manifest, catalogue] = await Promise.all([
      read('config/cv-manifest.json'),
      read('locales/en/ui.json').catch(() => null)
    ]);
    return (manifest?.layouts || []).map((id) => ({ id, name: catalogue?.layouts?.[id] || id }));
  }

  /** Checks the profile, then saves it, and shows the saved CV. */
  async save() {
    const problems = ProfileShape.problems(this.profile);
    if (problems.length) {
      this.showProblems(
        problems,
        `Not saved: the profile has ${problemCount(problems)}, marked beside the fields.`
      );
      return;
    }
    this.say('Saving…');
    const response = await this.fetch('api/profile', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.profile)
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = answer?.error || `the server answered ${response.status}`;
      if (Array.isArray(answer?.problems))
        this.showProblems(answer.problems, `Not saved: ${reason}`);
      else this.say(`Not saved: ${reason}`);
      return;
    }
    this.problems = [];
    this.unsaved = false;
    this.revision += 1;
    this.render();
    this.renderPreview();
    this.say('Saved. The preview shows the saved CV.');
  }

  showProblems(problems, message) {
    this.problems = problems;
    this.render();
    this.say(message);
    const first = problems.find(({ path }) => this.document.getElementById(idOf(path)));
    if (first) this.document.getElementById(idOf(first.path)).focus();
  }

  say(message) {
    this.document.querySelector('[data-editor-status]').textContent = message;
  }

  /** A structural change — an entry added, moved or removed — shown at once, with problems checked on saving. */
  change(profile) {
    this.profile = profile;
    this.problems = [];
    this.unsaved = true;
    this.render();
  }

  render() {
    const form = this.document.querySelector('[data-editor-form]');
    form.replaceChildren();
    const unplaced = ProfileForm.unplaced(this.problems);
    if (unplaced.length) {
      const summary = this.element('ul', 'editor-problems editor-unplaced');
      for (const { path, reason } of unplaced) {
        summary.append(this.element('li', '', `${path || 'The profile'} ${reason}`));
      }
      form.append(summary);
    }
    for (const node of ProfileForm.fields(this.profile, this.problems))
      form.append(this.node(node));
  }

  renderPreview() {
    const nav = this.document.querySelector('[data-editor-layouts]');
    nav.replaceChildren(
      ...this.layouts.map(({ id, name }) => {
        const pick = this.element('button', 'editor-layout', name);
        pick.type = 'button';
        pick.setAttribute('aria-pressed', String(id === this.layout));
        pick.addEventListener('click', () => {
          this.layout = id;
          this.renderPreview();
        });
        return pick;
      })
    );
    if (this.layout) {
      this.document
        .querySelector('[data-editor-preview]')
        .setAttribute(
          'src',
          `index.html?layout=${encodeURIComponent(this.layout)}&revision=${this.revision}`
        );
    }
  }

  node(node, context = '') {
    if (node.kind === 'list') return this.list(node, context);
    if (node.kind === 'group') return this.group(node, node.label, context);
    return this.field(node);
  }

  field(node) {
    const wrapper = this.element('div', 'editor-field');
    const id = idOf(node.path);
    const label = this.element(
      'label',
      '',
      node.required ? `${node.label} (required)` : node.label
    );
    label.htmlFor = id;
    const input = this.element(node.multiline ? 'textarea' : 'input', 'editor-input');
    if (!node.multiline) input.type = node.kind === 'address' ? 'url' : 'text';
    if (node.kind === 'year') input.inputMode = 'numeric';
    if (node.kind === 'month') input.placeholder = '2026-09';
    if (node.kind === 'period') input.placeholder = 'May 2015 – August 2015';
    input.id = id;
    input.name = node.path;
    input.dataset.path = node.path;
    input.value = String(node.value);
    input.addEventListener('input', () => {
      this.profile = ProfileForm.set(this.profile, node.path, input.value);
      this.unsaved = true;
      this.say('Changes not saved yet.');
    });
    wrapper.append(label, input);
    this.mark(wrapper, input, node);
    return wrapper;
  }

  group(node, legendText, context) {
    const fieldset = this.element('fieldset', 'editor-group');
    fieldset.append(this.element('legend', '', legendText));
    this.mark(fieldset, fieldset, node);
    for (const inner of node.fields) fieldset.append(this.node(inner, context));
    return fieldset;
  }

  list(node, context) {
    const fieldset = this.element('fieldset', 'editor-list');
    fieldset.id = idOf(node.path);
    fieldset.append(this.element('legend', '', node.label));
    this.mark(fieldset, fieldset, node);
    const item = node.itemLabel.toLowerCase();
    node.items.forEach((entry, index) => {
      const number = index + 1;
      const row = this.element('div', 'editor-entry');
      const inner = ` of ${item} ${number}`;
      row.append(
        entry.kind === 'group'
          ? this.group(entry, `${node.itemLabel} ${number}`, inner)
          : this.field(entry)
      );
      const tools = this.element('div', 'editor-entry-tools');
      tools.append(
        this.tool('Up', `Move ${item} ${number} up${context}`, index > 0, () =>
          this.change(ProfileForm.move(this.profile, node.path, index, index - 1))
        ),
        this.tool(
          'Down',
          `Move ${item} ${number} down${context}`,
          index < node.items.length - 1,
          () => this.change(ProfileForm.move(this.profile, node.path, index, index + 1))
        ),
        this.tool('Remove', `Remove ${item} ${number}${context}`, true, () =>
          this.change(ProfileForm.remove(this.profile, node.path, index))
        )
      );
      row.append(tools);
      fieldset.append(row);
    });
    const where = context.replace(/^ of /, ' to ');
    fieldset.append(
      this.tool(`Add ${item}`, `Add ${item}${where}`, true, () =>
        this.change(ProfileForm.add(this.profile, node.path))
      )
    );
    return fieldset;
  }

  /** Marks a field its problems are about, and lists them beside it. */
  mark(wrapper, control, node) {
    if (!node.problems.length) return;
    const list = this.element('ul', 'editor-problems');
    list.id = `${idOf(node.path)}-problems`;
    for (const reason of node.problems) list.append(this.element('li', '', reason));
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', list.id);
    wrapper.append(list);
  }

  tool(text, name, enabled, action) {
    const tool = this.element('button', 'editor-tool', text);
    tool.type = 'button';
    tool.setAttribute('aria-label', name);
    tool.disabled = !enabled;
    tool.addEventListener('click', action);
    return tool;
  }

  element(tag, className, text) {
    const element = this.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
}

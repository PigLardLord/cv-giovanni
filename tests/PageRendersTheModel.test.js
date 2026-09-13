/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { CVApplication } from '../core/CVApplication.js';
import { DocumentLocalizer } from '../core/DocumentLocalizer.js';
import { RendererContainer } from '../core/RendererContainer.js';
import { CvDocument } from '../domain/CvDocument.js';
import { CertificationsRenderer } from '../renderers/CertificationsRenderer.js';
import { EducationRenderer } from '../renderers/EducationRenderer.js';
import { ExperienceRenderer } from '../renderers/ExperienceRenderer.js';
import { HeaderRenderer } from '../renderers/HeaderRenderer.js';
import { InterestsRenderer } from '../renderers/InterestsRenderer.js';
import { LanguagesRenderer } from '../renderers/LanguagesRenderer.js';
import { ProfileRenderer } from '../renderers/ProfileRenderer.js';
import { SkillsRenderer } from '../renderers/SkillsRenderer.js';
import { SocialLinksRenderer } from '../renderers/SocialLinksRenderer.js';
import { SourceRenderer } from '../renderers/SourceRenderer.js';

// The PDF, the cover letter and the audits read CvDocument. The page's renderers used to read the
// profile JSON as loaded, each its own raw keys, so a default or a renamed key added to the model reached
// one artefact and not the other: #35 found the visible case, interests on the page only (#81). Every
// part of the page reads the model now, and this is what fails when one reads the profile again.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const profile = JSON.parse(read('profiles/general/en.json'));
const page = read('index.html');
const at = { url: 'http://localhost/index.html?layout=nerd' };
const i18n = { language: 'en', t: (key) => key };

/** The model, noting every key read from it that it does not have: a raw one such as `relevant_experience`. */
const watched = (model, strays) =>
  new Proxy(model, {
    get(target, key, receiver) {
      if (typeof key === 'string' && !(key in target)) strays.add(key);
      return Reflect.get(target, key, receiver);
    }
  });

// What script.js registers, in its order.
const RENDERERS = [
  ['HeaderRenderer', () => new HeaderRenderer(i18n)],
  ['SocialLinksRenderer', () => new SocialLinksRenderer()],
  ['ProfileRenderer', () => new ProfileRenderer()],
  ['ExperienceRenderer', () => new ExperienceRenderer(i18n)],
  ['EducationRenderer', () => new EducationRenderer()],
  ['CertificationsRenderer', () => new CertificationsRenderer()],
  ['SkillsRenderer', () => new SkillsRenderer()],
  ['LanguagesRenderer', () => new LanguagesRenderer()],
  ['InterestsRenderer', () => new InterestsRenderer()],
  ['SourceRenderer', () => new SourceRenderer(i18n)]
];

describe('the page reads the model, never the profile', () => {
  test('the watch notes a raw profile key read from the model', () => {
    const strays = new Set();
    const cv = watched(new CvDocument(profile), strays);

    expect(cv.experience).toEqual(profile.relevant_experience);
    expect(cv.relevant_experience).toBeUndefined();
    expect([...strays]).toEqual(['relevant_experience']);
  });

  test.each(RENDERERS)('%s reads only keys the model has', (name, make) => {
    const { document } = new JSDOM(page, at).window;
    const strays = new Set();

    make().render(document, watched(new CvDocument(profile), strays));

    expect([...strays]).toEqual([]);
  });

  // A renderer that returned early would read nothing, and pass the watch above.
  test('rendered from the model, the page carries the profile', () => {
    const { document } = new JSDOM(page, at).window;
    const cv = new CvDocument(profile);
    for (const [, make] of RENDERERS) make().render(document, cv);
    const text = document.body.textContent;

    for (const written of [
      profile.name,
      profile.title,
      profile.relevant_experience[0].company,
      profile.education[0].degree,
      profile.languages[0].name,
      profile.certifications[0].name,
      profile.skills[0].items[0].name
    ]) {
      expect(text).toContain(written);
    }
    expect(
      document.querySelector(`.social-links a[href="${profile.social[0].url}"]`)
    ).not.toBeNull();
    expect(document.getElementById('source-code').textContent).toContain(profile.name);
  });

  test('the localizer names the candidate from the model', () => {
    const { document } = new JSDOM(page).window;
    const strays = new Set();
    const naming = { language: 'en', t: (key, values) => `${key} ${values?.name ?? ''}` };

    new DocumentLocalizer(naming).apply(document, watched(new CvDocument(profile), strays));

    expect(document.title).toContain(profile.name);
    expect([...strays]).toEqual([]);
  });

  // The PDF exporter builds its own model from the profile, so the profile is what the page keeps.
  test('CVApplication hands the localizer and every renderer the model, and returns the profile', async () => {
    const received = [];
    const app = new CVApplication({ loadCVData: async () => profile }, new RendererContainer(), {
      apply: (root, cv) => received.push(['localizer', cv instanceof CvDocument])
    });
    app.registerRenderer('probe', {
      render: (root, cv) => received.push(['renderer', cv instanceof CvDocument])
    });

    const returned = await app.initialize(new JSDOM(page).window.document);

    expect(received).toEqual([
      ['localizer', true],
      ['renderer', true]
    ]);
    expect(returned).toBe(profile);
  });
});

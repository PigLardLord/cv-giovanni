/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import i18next from '../vendor/i18next/i18next.js';
import { I18nService } from '../core/I18nService.js';
import { CvDocument } from '../domain/CvDocument.js';
import { CareerHighlightsRenderer } from '../renderers/CareerHighlightsRenderer.js';
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
import { emptyFieldMarks, openEnds } from '../scripts/lib/empty-fields.mjs';

// The published profile fills every field, so the print audit only ever reads a CV with nothing left out, and the path
// a tailored profile takes when it leaves a field out was unit-tested and never printed (#178). This is the sparse CV
// the audits run against: the copy the review of #175 printed, the published profile without Apparound's location,
// Catania's period, the first certificate's year and the second's issuer. It is made here from the published profile
// rather than committed beside it, so it cannot drift from the CV it stands for, and it names no employer the public
// profile does not. It is rendered by the page's own renderers, into the page the browser prints, and its text is read
// with the check `npm run audit:print` runs on the paper. The build of the same copy, printed by Chrome and audited, is
// what the commit that added this reports.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const published = JSON.parse(read('profiles/general/en.json'));
const catalogue = JSON.parse(read('locales/en/cv.json'));
const page = read('index.html');
const { at } = catalogue.experience;

const sparse = structuredClone(published);
delete sparse.relevant_experience[1].location;
delete sparse.education[1].period;
delete sparse.certifications[0].year;
delete sparse.certifications[1].issuer;

/** The CV's labels, from the catalogue the page loads, through i18next as the page reads them. */
const i18nIn = async (locale) => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    resources: { [locale]: { cv: JSON.parse(read(`locales/${locale}/cv.json`)) } },
    interpolation: { escapeValue: false }
  });
  return new I18nService(instance);
};

// What the renderers wrote before #169, whatever the entry held: the check has to catch them on this copy.
class ExperienceBefore169 extends ExperienceRenderer {
  createJobEntry(root, job) {
    const at = this.i18n.t('experience.at', { ns: 'cv' });
    const entry = this.createElement(root, 'div', 'job-entry');
    entry.appendChild(
      this.createElement(
        root,
        'div',
        'job-header',
        `${job.title} ${at} ${job.company}, ${job.location ?? ''}`
      )
    );
    return entry;
  }
}
class EducationBefore169 extends EducationRenderer {
  createEducationEntry(root, edu) {
    return this.appendPieces(root, this.createElement(root, 'div', 'edu-entry'), [
      this.createElement(root, 'div', 'edu-degree', edu.degree),
      this.appendPieces(root, this.createElement(root, 'div'), [
        this.createElement(root, 'span', 'edu-school', edu.school),
        ' ',
        this.createElement(root, 'span', 'edu-period', `(${edu.period ?? ''})`)
      ])
    ]);
  }
}
class CertificationsBefore169 extends CertificationsRenderer {
  createCertificationItem(root, cert) {
    return this.appendPieces(root, this.createElement(root, 'li'), [
      this.createElement(root, 'strong', '', cert.name),
      ` – ${cert.issuer ?? ''} (${cert.year ?? ''})`
    ]);
  }
}

/** What script.js registers, in its order; the entries' renderers replaceable. */
const renderers = (
  i18n,
  {
    Experience = ExperienceRenderer,
    Education = EducationRenderer,
    Certifications = CertificationsRenderer
  } = {}
) => [
  new HeaderRenderer(i18n),
  new SocialLinksRenderer(),
  new ProfileRenderer(),
  new CareerHighlightsRenderer(),
  new Experience(i18n),
  new Education(i18n),
  new Certifications(),
  new SkillsRenderer(),
  new LanguagesRenderer(),
  new InterestsRenderer(),
  new SourceRenderer(i18n)
];

const BLOCKS = /^(ARTICLE|ASIDE|DIV|FOOTER|H[1-6]|HEADER|LI|MAIN|NAV|OL|P|SECTION|UL)$/;
const UNPRINTED = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/;

/**
 * The page's text as lines, a block element opening and closing one: what a text layer reads, without the layout. What
 * the print never shows is left out, a hidden element and Nerd Mode's Swift file with it.
 */
function textOf(node) {
  if (node.nodeType === node.TEXT_NODE) return node.nodeValue;
  if (node.nodeType !== node.ELEMENT_NODE || UNPRINTED.test(node.tagName)) return '';
  if (node.hasAttribute('hidden') || node.classList.contains('source-view')) return '';
  const inner = [...node.childNodes].map(textOf).join('');
  return BLOCKS.test(node.tagName) ? `\n${inner}\n` : inner;
}

/** The profile rendered into index.html by the page's renderers, as lines of text. */
async function printed(profile, replaced) {
  const { document } = new JSDOM(page, { url: 'http://localhost/index.html?layout=spotlight' })
    .window;
  const cv = new CvDocument(profile);
  for (const renderer of renderers(await i18nIn('en'), replaced)) renderer.render(document, cv);
  return textOf(document.body)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Every string a profile writes, whose words are its own, as the print audit collects them. */
const strings = (node) =>
  typeof node === 'string'
    ? [node]
    : node && typeof node === 'object'
      ? Object.values(node).flatMap(strings)
      : [];
const traces = (text, profile) =>
  emptyFieldMarks(text, { ends: openEnds(profile, { at }), written: strings(profile) });

describe('a sparse CV, printed', () => {
  test('each entry that leaves a part out opens a line of its own, where the check reads it', async () => {
    const text = await printed(sparse);
    const lines = text.split('\n');

    expect(openEnds(sparse, { at })).toEqual(
      expect.arrayContaining([
        `${sparse.relevant_experience[1].title} ${at} ${sparse.relevant_experience[1].company}`,
        sparse.education[1].school,
        `${sparse.certifications[0].name} – ${sparse.certifications[0].issuer}`,
        sparse.certifications[1].name
      ])
    );
    for (const end of openEnds(sparse, { at })) {
      expect(lines.some((line) => line.startsWith(end))).toBe(true);
    }
  });

  test('carries no trace of the fields it leaves out', async () => {
    expect(traces(await printed(sparse), sparse)).toEqual([]);
  });

  test('as the renderers wrote it before #169, carries every trace the check names', async () => {
    const text = await printed(sparse, {
      Experience: ExperienceBefore169,
      Education: EducationBefore169,
      Certifications: CertificationsBefore169
    });
    const role = sparse.relevant_experience[1];

    expect(traces(text, sparse)).toEqual(
      expect.arrayContaining([
        {
          mark: `${role.title} ${at} ${role.company},`,
          line: `${role.title} ${at} ${role.company},`
        },
        {
          mark: '()',
          line: `${sparse.certifications[0].name} – ${sparse.certifications[0].issuer} ()`
        },
        {
          mark: `${sparse.certifications[1].name} –`,
          line: `${sparse.certifications[1].name} – (${sparse.certifications[1].year})`
        },
        { mark: '()', line: `${sparse.education[1].school} ()` }
      ])
    );
  });
});

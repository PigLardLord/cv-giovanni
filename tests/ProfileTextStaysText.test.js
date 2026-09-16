import { JSDOM } from 'jsdom';
import { BaseRenderer } from '../renderers/BaseRenderer.js';
import { CertificationsRenderer } from '../renderers/CertificationsRenderer.js';
import { EducationRenderer } from '../renderers/EducationRenderer.js';
import { ErrorRenderer } from '../renderers/ErrorRenderer.js';
import { ExperienceRenderer } from '../renderers/ExperienceRenderer.js';
import { HeaderRenderer } from '../renderers/HeaderRenderer.js';
import { LanguagesRenderer } from '../renderers/LanguagesRenderer.js';
import { fedTheModel } from './support/model.js';

// Five renderers put profile strings into the page as HTML (#157). The profile is edited in the browser and will be
// tailored by a model, so a summary reading "reduced crash rate to <0.1%" opened a tag and hid the rest of the line,
// and an employer written "AT&amp;T" printed as "AT&T". A string from the data reaches the page as text.
const awkward = (label) => `${label} <b>bold</b> <0.1% AT&amp;T "quoted"`;

const profile = {
  name: 'Ada Lovelace',
  title: 'Engineer',
  email: awkward('email'),
  phone: awkward('phone'),
  relevant_experience: [
    {
      title: awkward('title'),
      company: awkward('company'),
      location: awkward('location'),
      period: awkward('period'),
      summary: awkward('summary'),
      description: awkward('description'),
      highlights: [awkward('highlight')]
    }
  ],
  education: [
    {
      degree: awkward('degree'),
      school: awkward('school'),
      period: awkward('eduperiod'),
      description: awkward('edudescription')
    }
  ],
  languages: [{ name: awkward('language'), level: awkward('level') }],
  certifications: [
    {
      name: awkward('cert'),
      issuer: awkward('issuer'),
      year: awkward('year'),
      url: 'https://example.com/cert',
      description: awkward('certdescription')
    },
    { name: awkward('unlinked'), issuer: 'Issuer', year: 2024 }
  ]
};

const page = () =>
  new JSDOM(`<!doctype html><html><body>
    <div id="name"></div><div id="title"></div><div id="subtitle" hidden></div>
    <div id="availability" hidden></div><div id="location"></div><div id="contacts"></div>
    <section><div id="experience"></div></section>
    <section><div id="education"></div></section>
    <section><ul id="languages"></ul></section>
    <section><ul id="certifications"></ul></section>
  </body></html>`).window.document;

const renderAll = (document) => {
  [
    new HeaderRenderer(),
    new ExperienceRenderer(),
    new EducationRenderer(),
    new LanguagesRenderer(),
    new CertificationsRenderer()
  ].forEach((renderer) => fedTheModel(renderer).render(document, profile));
  return document;
};

describe('profile text reaches the page as text', () => {
  test.each([
    ['contacts', ['email', 'phone']],
    [
      'experience',
      ['title', 'company', 'location', 'period', 'summary', 'description', 'highlight']
    ],
    ['education', ['degree', 'school', 'eduperiod', 'edudescription']],
    ['languages', ['language', 'level']],
    ['certifications', ['cert', 'issuer', 'year', 'certdescription', 'unlinked']]
  ])('%s shows every string verbatim and builds nothing from it', (id, labels) => {
    const section = renderAll(page()).getElementById(id);
    const text = section.textContent.replace(/\s+/g, ' ');

    labels.forEach((label) => expect(text).toContain(awkward(label)));
    expect(section.querySelectorAll('b')).toHaveLength(0);
  });

  test('keeps the words and the structure the renderers wrote before', () => {
    const document = renderAll(page());
    const oneLine = (selector) =>
      document.querySelector(selector).textContent.replace(/\s+/g, ' ').trim();

    expect(oneLine('.job-header')).toBe(
      `${awkward('title')} at ${awkward('company')}, ${awkward('location')}`
    );
    expect(document.querySelector('.job-title').textContent).toBe(awkward('title'));
    expect(document.querySelector('.job-company').textContent).toBe(awkward('company'));
    expect(oneLine('.edu-entry div:nth-child(2)')).toBe(
      `${awkward('school')} (${awkward('eduperiod')})`
    );
    expect(oneLine('#languages li')).toBe(`${awkward('language')}: ${awkward('level')}`);
    expect(document.querySelector('#languages li strong').textContent).toBe(
      `${awkward('language')}:`
    );
    expect(document.querySelector('#certifications li a strong').textContent).toBe(awkward('cert'));
    expect(document.querySelector('#certifications li a').getAttribute('href')).toBe(
      'https://example.com/cert'
    );
    expect(oneLine('#contacts')).toBe(`Email: ${awkward('email')} Phone: ${awkward('phone')}`);
  });

  // The error panel's message can carry a thrown error's text, which is not the page's own markup either.
  test('the error panel writes its words as text', () => {
    const document = page();

    new ErrorRenderer().render(document, {
      title: awkward('title'),
      message: awkward('message'),
      hint: awkward('hint')
    });

    expect(document.body.textContent).toContain(awkward('message'));
    expect(document.body.querySelectorAll('b')).toHaveLength(0);
  });

  test('createElement sets its content as text, never as markup', () => {
    const document = page();

    const element = new BaseRenderer().createElement(document, 'p', 'x', '<b>bold</b> &amp;');

    expect(element.textContent).toBe('<b>bold</b> &amp;');
    expect(element.children).toHaveLength(0);
  });
});

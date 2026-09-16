import { readFileSync } from 'node:fs';
import { EducationRenderer } from '../renderers/EducationRenderer.js';
import { JSDOM } from 'jsdom';
import i18next from '../vendor/i18next/i18next.js';
import { I18nService } from '../core/I18nService.js';
import { fedTheModel } from './support/model.js';

/** The CV's labels in a language, from the catalogue the page loads, through i18next as the page reads them. */
const i18nIn = async (locale) => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    resources: {
      [locale]: {
        cv: JSON.parse(
          readFileSync(new URL(`../locales/${locale}/cv.json`, import.meta.url), 'utf8')
        )
      }
    },
    interpolation: { escapeValue: false }
  });
  return new I18nService(instance);
};

describe('EducationRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="education"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = fedTheModel(new EducationRenderer());
  });

  test('renders education entries correctly', () => {
    const data = {
      education: [
        {
          degree: 'M.Sc. Computer Science',
          school: 'University of Technology',
          period: '2020',
          description: 'Specialized in AI and machine learning.'
        },
        {
          degree: 'B.Sc. Software Engineering',
          school: 'State University',
          period: '2018',
          description: 'Foundation in software development principles.'
        }
      ]
    };

    renderer.render(document, data);

    const educationDiv = document.getElementById('education');
    const eduEntries = educationDiv.querySelectorAll('.edu-entry');

    expect(eduEntries).toHaveLength(2);
    expect(eduEntries[0].textContent).toContain('M.Sc. Computer Science');
    expect(eduEntries[0].textContent).toContain('University of Technology');
    expect(eduEntries[1].textContent).toContain('State University');
  });

  // A Master's programme a German reader would take for the Bologna second cycle states its scope on the line it
  // already has (#48): the catalogue writes the words, Intl the number.
  describe('a degree that states its credits', () => {
    const education = [
      {
        degree: "First Level Professional Master's Programme in Mobile Applications Development",
        school: 'Università degli Studi di Pisa',
        period: '2014 – 2016',
        credits: 60
      },
      {
        degree: 'B.Sc. Computer Engineering',
        school: 'Università degli Studi di Catania',
        period: '2009'
      }
    ];
    const schoolLines = () =>
      [...document.querySelectorAll('.edu-entry > div:nth-child(2)')].map((line) =>
        line.textContent.replace(/\s+/g, ' ')
      );

    test('reads "School (period) · 60 ECTS", and a degree without credits is unchanged', async () => {
      fedTheModel(new EducationRenderer(await i18nIn('en'))).render(document, { education });

      expect(schoolLines()).toEqual([
        'Università degli Studi di Pisa (2014 – 2016) · 60 ECTS',
        'Università degli Studi di Catania (2009)'
      ]);
      expect(
        [...document.querySelectorAll('.edu-credits')].map((span) => span.textContent)
      ).toEqual(['60 ECTS']);
    });

    test('writes the count as the CV’s language writes numbers', async () => {
      fedTheModel(new EducationRenderer(await i18nIn('de'))).render(document, {
        education: [{ ...education[0], credits: 1500 }]
      });

      expect(document.querySelector('.edu-credits').textContent).toBe('1.500 ECTS');
    });
  });

  test('handles missing education data gracefully', () => {
    expect(() => {
      renderer.render(document, {});
    }).not.toThrow();

    expect(() => {
      renderer.render(document, { education: null });
    }).not.toThrow();
  });

  test('handles empty education array', () => {
    renderer.render(document, { education: [] });

    const educationDiv = document.getElementById('education');
    const eduEntries = educationDiv.querySelectorAll('.edu-entry');
    expect(eduEntries).toHaveLength(0);
  });
});

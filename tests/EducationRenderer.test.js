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
    const lines = (selector) =>
      [...document.querySelectorAll(selector)].map((line) => line.textContent.replace(/\s+/g, ' '));
    const credits = () => lines('.edu-credits');

    test('reads "Degree (60 ECTS)", the school lines unchanged, and a degree without credits as it was', async () => {
      fedTheModel(new EducationRenderer(await i18nIn('en'))).render(document, { education });

      expect(lines('.edu-degree')).toEqual([
        "First Level Professional Master's Programme in Mobile Applications Development (60 ECTS)",
        'B.Sc. Computer Engineering'
      ]);
      expect(credits()).toEqual(['(60 ECTS)']);
      expect(document.querySelector('.edu-credits').classList.contains('no-break')).toBe(true);
      expect(lines('.edu-entry > div:nth-child(2)')).toEqual([
        'Università degli Studi di Pisa (2014 – 2016)',
        'Università degli Studi di Catania (2009)'
      ]);
    });

    test('writes the count as the CV’s language writes numbers', async () => {
      fedTheModel(new EducationRenderer(await i18nIn('de'))).render(document, {
        education: [{ ...education[0], credits: 1500 }]
      });

      expect(credits()).toEqual(['(1.500 ECTS)']);
    });

    // The code review of #179: a renderer built without the i18n service still states the scope.
    test('without the i18n service, still writes the credits in the catalogue’s English words', () => {
      fedTheModel(new EducationRenderer()).render(document, { education });

      expect(credits()).toEqual(['(60 ECTS)']);
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

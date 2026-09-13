import { ExperienceRenderer } from '../renderers/ExperienceRenderer.js';
import { JSDOM } from 'jsdom';
import { fedTheModel } from './support/model.js';

describe('ExperienceRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="experience"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = fedTheModel(new ExperienceRenderer());
  });

  test('holds every hyphenated compound on one line without touching the text', () => {
    const data = {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          location: 'Pisa',
          period: '2015-2018',
          summary: 'B2B sales-automation platform for field sales teams.',
          highlights: ['Built an offline-first architecture in Objective-C.']
        }
      ]
    };

    renderer.render(document, data);

    // A line that breaks at an existing hyphen extracts from the PDF without it:
    // "offline-first" reaches a parser as "offlinefirst" and no search for the
    // canonical spelling finds it.
    const highlight = document.querySelector('.job-highlights li');
    expect(highlight.textContent).toBe('Built an offline-first architecture in Objective-C.');
    expect([...highlight.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      'offline-first',
      'Objective-C'
    ]);

    const summary = document.querySelector('.job-summary');
    expect(summary.textContent).toBe('B2B sales-automation platform for field sales teams.');
    expect([...summary.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      'sales-automation'
    ]);
  });

  test('renders experience entries correctly', () => {
    const data = {
      relevant_experience: [
        {
          title: 'Senior Developer',
          company: 'Tech Corp',
          location: 'San Francisco',
          period: '2020-2023',
          description: 'Led development of mobile apps.'
        },
        {
          title: 'Developer',
          company: 'StartupXYZ',
          location: 'Austin',
          period: '2018-2020',
          description: 'Built web applications.'
        }
      ]
    };

    renderer.render(document, data);

    const experienceDiv = document.getElementById('experience');
    const jobEntries = experienceDiv.querySelectorAll('.job-entry');

    expect(jobEntries).toHaveLength(2);
    expect(jobEntries[0].textContent).toContain('Senior Developer');
    expect(jobEntries[0].textContent).toContain('Tech Corp');
    expect(jobEntries[1].textContent).toContain('StartupXYZ');
  });

  test('handles missing experience data gracefully', () => {
    expect(() => {
      renderer.render(document, {});
    }).not.toThrow();

    expect(() => {
      renderer.render(document, { relevant_experience: null });
    }).not.toThrow();
  });

  test('handles empty experience array', () => {
    renderer.render(document, { relevant_experience: [] });

    const experienceDiv = document.getElementById('experience');
    const jobEntries = experienceDiv.querySelectorAll('.job-entry');
    expect(jobEntries).toHaveLength(0);
  });

  test('renders structured summaries and achievement bullets', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Senior Engineer',
          company: 'Acme',
          location: 'Berlin',
          period: '2020–2026',
          summary: 'Enterprise mobile platform.',
          highlights: ['Improved test coverage.', 'Automated releases.']
        }
      ]
    });

    expect(document.querySelector('.job-summary').textContent).toBe('Enterprise mobile platform.');
    expect(
      [...document.querySelectorAll('.job-highlights li')].map((item) => item.textContent)
    ).toEqual(['Improved test coverage.', 'Automated releases.']);
    expect(document.querySelector('.job-description')).toBeNull();
  });

  test('gives each role its length, counted to the month the profile is written as of (#55)', () => {
    renderer.render(document, {
      asOf: '2026-09',
      relevant_experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          location: 'Berlin',
          period: 'August 2018 – Present',
          highlights: []
        },
        { title: 'Intern', company: 'Marte 5', location: 'Livorno', period: '2015', highlights: [] }
      ]
    });

    expect(
      [...document.querySelectorAll('.job-period')].map((period) => period.textContent)
    ).toEqual(['August 2018 – Present (8 years, 2 months)', '2015']);
    // Its own element, so a narrow line breaks between the dates and the length, never inside the length.
    expect(
      [...document.querySelectorAll('.job-period .job-tenure')].map((tenure) => tenure.textContent)
    ).toEqual(['(8 years, 2 months)']);
    // Each unit stays whole, so a column too narrow for the length breaks after the comma, never inside "2 months".
    expect(
      [...document.querySelectorAll('.job-tenure .no-break')].map((unit) => unit.textContent)
    ).toEqual(['8 years', '2 months']);
  });
});

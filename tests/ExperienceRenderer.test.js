import { ExperienceRenderer } from '../renderers/ExperienceRenderer.js';
import { JSDOM } from 'jsdom';

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
    renderer = new ExperienceRenderer();
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
});
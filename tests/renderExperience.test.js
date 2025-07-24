import { renderExperience } from '../renderers/renderExperience.js';
import { JSDOM } from 'jsdom';

describe('renderExperience', () => {
  let document;

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
  });

  test('renders experience entries correctly', () => {
    const data = {
      relevant_experience: [
        {
          title: 'Senior Developer',
          company: 'Tech Corp',
          location: 'Berlin',
          period: '2020-2023',
          description: 'Led development team'
        },
        {
          title: 'Junior Developer',
          company: 'StartupCo',
          location: 'Munich',
          period: '2018-2020',
          description: 'Built web applications'
        }
      ]
    };

    renderExperience(document, data);

    const expDiv = document.getElementById('experience');
    const jobEntries = expDiv.querySelectorAll('.job-entry');
    
    expect(jobEntries).toHaveLength(2);
    
    // Check first job
    expect(jobEntries[0].querySelector('.job-title').textContent).toBe('Senior Developer');
    expect(jobEntries[0].querySelector('.job-company').textContent).toBe('Tech Corp');
    expect(jobEntries[0].querySelector('.job-period').textContent).toBe('2020-2023');
    expect(jobEntries[0].querySelector('.job-description').textContent).toBe('Led development team');
  });

  test('handles missing experience container', () => {
    const dom = new JSDOM(`<html><body></body></html>`);
    const docWithoutExp = dom.window.document;
    
    expect(() => {
      renderExperience(docWithoutExp, { relevant_experience: [] });
    }).not.toThrow();
  });

  test('handles missing experience data', () => {
    expect(() => {
      renderExperience(document, {});
    }).not.toThrow();
  });
});
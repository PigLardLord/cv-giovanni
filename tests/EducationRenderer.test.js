import { EducationRenderer } from '../renderers/EducationRenderer.js';
import { JSDOM } from 'jsdom';

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
    renderer = new EducationRenderer();
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
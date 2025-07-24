import { renderEducation } from '../renderers/renderEducation.js';
import { JSDOM } from 'jsdom';

describe('renderEducation', () => {
  let document;

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
  });

  test('renders education entries correctly', () => {
    const data = {
      education: [
        {
          degree: 'M.Sc. Computer Science',
          school: 'Tech University',
          period: '2020',
          description: 'Advanced computer science studies'
        }
      ]
    };

    renderEducation(document, data);

    const eduDiv = document.getElementById('education');
    const eduEntries = eduDiv.querySelectorAll('.edu-entry');
    
    expect(eduEntries).toHaveLength(1);
    expect(eduEntries[0].querySelector('.edu-degree').textContent).toBe('M.Sc. Computer Science');
    expect(eduEntries[0].querySelector('.edu-school').textContent).toBe('Tech University');
    expect(eduEntries[0].querySelector('.edu-period').textContent).toBe('(2020)');
  });

  test('handles missing education data', () => {
    expect(() => {
      renderEducation(document, {});
    }).not.toThrow();
  });
});
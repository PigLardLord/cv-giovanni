import { renderCertifications } from '../renderers/renderCertifications.js';
import { JSDOM } from 'jsdom';

describe('renderCertifications', () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <ul id="certifications"></ul>
        </body>
      </html>
    `);
    document = dom.window.document;
  });

  test('renders certifications correctly', () => {
    const data = {
      certifications: [
        {
          name: 'AWS Certified',
          issuer: 'Amazon',
          year: 2023,
          url: 'https://example.com',
          description: 'Cloud certification'
        }
      ]
    };

    renderCertifications(document, data);

    const certList = document.getElementById('certifications');
    const items = certList.querySelectorAll('li');
    
    expect(items).toHaveLength(1);
    expect(items[0].innerHTML).toContain('AWS Certified');
    expect(items[0].innerHTML).toContain('Amazon');
    expect(items[0].innerHTML).toContain('2023');
  });

  test('handles missing certifications data', () => {
    expect(() => {
      renderCertifications(document, {});
    }).not.toThrow();
  });
});
import { CertificationsRenderer } from '../renderers/CertificationsRenderer.js';
import { JSDOM } from 'jsdom';

describe('CertificationsRenderer', () => {
  let document;
  let renderer;

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
    renderer = new CertificationsRenderer();
  });

  test('renders certifications with URLs correctly', () => {
    const data = {
      certifications: [
        {
          name: 'AWS Solutions Architect',
          issuer: 'Amazon',
          year: 2023,
          url: 'https://aws.amazon.com/certification/',
          description: 'Advanced cloud architecture certification.'
        }
      ]
    };

    renderer.render(document, data);

    const certList = document.getElementById('certifications');
    const items = certList.querySelectorAll('li');
    
    expect(items).toHaveLength(1);
    expect(items[0].innerHTML).toContain('<a href="https://aws.amazon.com/certification/"');
    expect(items[0].textContent).toContain('AWS Solutions Architect');
    expect(items[0].textContent).toContain('Amazon (2023)');
  });

  test('renders certifications without URLs correctly', () => {
    const data = {
      certifications: [
        {
          name: 'Project Management',
          issuer: 'PMI',
          year: 2022
        }
      ]
    };

    renderer.render(document, data);

    const certList = document.getElementById('certifications');
    const items = certList.querySelectorAll('li');
    
    expect(items).toHaveLength(1);
    expect(items[0].innerHTML).toContain('<strong>Project Management</strong>');
    expect(items[0].innerHTML).not.toContain('<a href=');
    expect(items[0].textContent).toContain('PMI (2022)');
  });

  test('handles missing certifications data gracefully', () => {
    expect(() => {
      renderer.render(document, {});
    }).not.toThrow();
    
    expect(() => {
      renderer.render(document, { certifications: null });
    }).not.toThrow();
  });
});
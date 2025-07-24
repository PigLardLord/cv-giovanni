import { HeaderRenderer } from '../renderers/HeaderRenderer.js';
import { JSDOM } from 'jsdom';

describe('HeaderRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="name"></div>
          <div id="title"></div>
          <div id="location"></div>
          <div id="contacts"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = new HeaderRenderer();
  });

  test('renders header information correctly', () => {
    const data = {
      name: 'John Doe',
      title: 'Software Engineer',
      location: 'Berlin',
      email: 'john@example.com',
      phone: '+49 123 456'
    };

    renderer.render(document, data);

    expect(document.getElementById('name').textContent).toBe('John Doe');
    expect(document.getElementById('title').textContent).toBe('Software Engineer');
    expect(document.getElementById('location').textContent).toBe('Berlin');
    expect(document.getElementById('contacts').innerHTML).toContain('john@example.com');
  });

  test('validates data correctly', () => {
    expect(renderer.validate({ name: 'John' })).toBe(true);
    expect(renderer.validate({})).toBe(false);
    expect(renderer.validate(null)).toBe(false);
  });

  test('handles missing DOM elements gracefully', () => {
    const dom = new JSDOM(`<html><body></body></html>`);
    const emptyDoc = dom.window.document;

    expect(() => {
      renderer.render(emptyDoc, { name: 'John' });
    }).not.toThrow();
  });
});
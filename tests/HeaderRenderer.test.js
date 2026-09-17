import { HeaderRenderer } from '../renderers/HeaderRenderer.js';
import { CvDocument } from '../domain/CvDocument.js';
import { JSDOM } from 'jsdom';
import { fedTheModel } from './support/model.js';

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
          <div id="subtitle" hidden></div>
          <div id="availability" hidden></div>
          <div id="location"></div>
          <div id="contacts"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = fedTheModel(new HeaderRenderer());
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
    expect(renderer.validate(new CvDocument({ name: 'John' }))).toBe(true);
    expect(renderer.validate(new CvDocument({}))).toBe(false);
    expect(renderer.validate(null)).toBe(false);
  });

  test('handles missing DOM elements gracefully', () => {
    const dom = new JSDOM(`<html><body></body></html>`);
    const emptyDoc = dom.window.document;

    expect(() => {
      renderer.render(emptyDoc, { name: 'John' });
    }).not.toThrow();
  });

  test('renders optional subtitle and availability when provided', () => {
    renderer.render(document, {
      name: 'John Doe',
      subtitle: 'iOS · Android · CI/CD',
      availability: 'Available immediately'
    });

    expect(document.getElementById('subtitle').textContent).toBe('iOS · Android · CI/CD');
    expect(document.getElementById('subtitle').hidden).toBe(false);
    expect(document.getElementById('availability').textContent).toBe('Available immediately');
    expect(document.getElementById('availability').hidden).toBe(false);
  });

  // A wrap beside a separator strands it: "Swift · SwiftUI · Enterprise Mobility ·" / "CI/CD" at 390px (#180).
  test('holds each separator in the subtitle and the availability to the words either side of it', () => {
    renderer.render(document, {
      name: 'John Doe',
      subtitle: 'iOS · Android · CI/CD',
      availability: 'EU citizen · no visa needed'
    });

    const held = (id) =>
      [...document.getElementById(id).querySelectorAll('.no-break')].map(
        (span) => span.textContent
      );
    expect(held('subtitle')).toEqual([' · ', ' · ']);
    expect(held('availability')).toEqual([' · ']);
    expect(document.getElementById('subtitle').textContent).toBe('iOS · Android · CI/CD');
  });

  test('localizes contact labels', () => {
    const localized = fedTheModel(
      new HeaderRenderer({
        t: (key) => ({ 'contacts.email': 'E-Mail', 'contacts.phone': 'Telefon' })[key]
      })
    );
    localized.render(document, { name: 'John', email: 'john@example.com', phone: '123' });

    expect(document.getElementById('contacts').textContent).toContain('E-Mail:');
    expect(document.getElementById('contacts').textContent).toContain('Telefon:');
  });
});

import { ProfileRenderer } from '../renderers/ProfileRenderer.js';
import { JSDOM } from 'jsdom';

describe('ProfileRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <p id="profile"></p>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = new ProfileRenderer();
  });

  test('renders profile text correctly', () => {
    const data = {
      profile: 'Experienced developer with expertise in mobile applications.'
    };

    renderer.render(document, data);

    const profileElement = document.getElementById('profile');
    expect(profileElement.textContent).toBe('Experienced developer with expertise in mobile applications.');
  });

  test('handles missing profile gracefully', () => {
    renderer.render(document, {});

    const profileElement = document.getElementById('profile');
    expect(profileElement.textContent).toBe('');
  });

  test('handles missing element gracefully', () => {
    const dom = new JSDOM(`<html><body></body></html>`);
    const docWithoutProfile = dom.window.document;
    
    expect(() => {
      renderer.render(docWithoutProfile, { profile: 'Test' });
    }).not.toThrow();
  });
});
import { renderProfile } from '../renderers/renderProfile.js';
import { JSDOM } from 'jsdom';

describe('renderProfile', () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="profile"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
  });

  test('renders profile text correctly', () => {
    const data = {
      profile: 'Experienced developer with strong technical skills.'
    };

    renderProfile(document, data);

    expect(document.getElementById('profile').textContent).toBe(
      'Experienced developer with strong technical skills.'
    );
  });

  test('handles missing profile data', () => {
    renderProfile(document, {});
    expect(document.getElementById('profile').textContent).toBe('');
  });

  test('handles missing profile element', () => {
    const dom = new JSDOM(`<html><body></body></html>`);
    const docWithoutProfile = dom.window.document;
    
    expect(() => {
      renderProfile(docWithoutProfile, { profile: 'test' });
    }).not.toThrow();
  });
});
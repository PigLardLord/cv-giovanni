import { SocialLinksRenderer } from '../renderers/SocialLinksRenderer.js';
import { JSDOM } from 'jsdom';

describe('SocialLinksRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div class="social-links"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = new SocialLinksRenderer();
  });

  test('renders social links correctly', () => {
    const data = {
      social: [
        { platform: 'GitHub', url: 'https://github.com/user' },
        { platform: 'LinkedIn', url: 'https://linkedin.com/in/user' }
      ]
    };

    renderer.render(document, data);

    const socialLinksContainer = document.querySelector('.social-links');
    const links = socialLinksContainer.querySelectorAll('a');
    expect(links).toHaveLength(2);
    
    expect(links[0].textContent).toBe('GitHub');
    expect(links[0].href).toBe('https://github.com/user');
    expect(links[0].target).toBe('_blank');
    expect(links[0].rel).toBe('noopener noreferrer');
    
    expect(links[1].textContent).toBe('LinkedIn');
    expect(links[1].href).toBe('https://linkedin.com/in/user');
  });

  test('handles missing container gracefully', () => {
    const dom = new JSDOM(`<html><body></body></html>`);
    const docWithoutContainer = dom.window.document;
    const data = { social: [{ platform: 'GitHub', url: 'https://github.com/user' }] };
    
    expect(() => {
      renderer.render(docWithoutContainer, data);
    }).not.toThrow();
  });

  test('handles missing social data gracefully', () => {
    expect(() => {
      renderer.render(document, {});
    }).not.toThrow();
    
    expect(() => {
      renderer.render(document, { social: null });
    }).not.toThrow();
  });

  test('handles empty social data array', () => {
    renderer.render(document, { social: [] });
    
    const socialLinksContainer = document.querySelector('.social-links');
    const links = socialLinksContainer.querySelectorAll('a');
    expect(links).toHaveLength(0);
  });
});
import { SocialLinksRenderer } from '../renderers/SocialLinksRenderer.js';
import { JSDOM } from 'jsdom';
import { fedTheModel } from './support/model.js';

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
    renderer = fedTheModel(new SocialLinksRenderer());
  });

  const links = () => document.querySelector('.social-links').querySelectorAll('a');

  test('renders social links correctly', () => {
    const data = {
      social: [
        { platform: 'GitHub', url: 'https://github.com/user' },
        { platform: 'LinkedIn', url: 'https://linkedin.com/in/user' }
      ]
    };

    renderer.render(document, data);

    expect(links()).toHaveLength(2);

    expect(links()[0].href).toBe('https://github.com/user');
    expect(links()[0].target).toBe('_blank');
    expect(links()[0].rel).toBe('noopener noreferrer');
    expect(links()[1].href).toBe('https://linkedin.com/in/user');
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

    expect(links()).toHaveLength(0);
  });

  describe('print-meaningful link text', () => {
    test('shows the readable address rather than a bare platform name', () => {
      renderer.render(document, {
        social: [
          { platform: 'GitHub', url: 'https://github.com/PigLardLord' },
          { platform: 'LinkedIn', url: 'https://www.linkedin.com/in/piglardlord/' },
          { platform: 'Web CV', url: 'https://piglardlord.github.io/cv-giovanni/' }
        ]
      });

      expect(links()[0].textContent).toBe('github.com/PigLardLord');
      expect(links()[1].textContent).toBe('linkedin.com/in/piglardlord');
      expect(links()[2].textContent).toBe('piglardlord.github.io/cv-giovanni');
    });

    test('keeps the platform name as the accessible label', () => {
      renderer.render(document, {
        social: [{ platform: 'GitHub', url: 'https://github.com/PigLardLord' }]
      });

      expect(links()[0].getAttribute('title')).toBe('GitHub');
    });

    test('falls back to the platform name when the url is unusable', () => {
      renderer.render(document, {
        social: [{ platform: 'GitHub', url: '' }]
      });

      expect(links()[0].textContent).toBe('GitHub');
    });
  });

  describe('separator spacing', () => {
    const data = {
      social: [
        { platform: 'GitHub', url: 'https://github.com/PigLardLord' },
        { platform: 'LinkedIn', url: 'https://www.linkedin.com/in/piglardlord/' }
      ]
    };

    /*
     * Regression: the separator used to be a CSS `content: ' · '` whose spaces
     * Chromium collapsed in print, so the PDF read
     * `github.com/PigLardLord·linkedin.com/in/piglardlord`. A real element
     * carries real margins that cannot collapse away.
     */
    test('joins the links with a real separator element, not generated content', () => {
      renderer.render(document, data);

      const separators = document
        .querySelector('.social-links')
        .querySelectorAll('.inline-separator');

      expect(separators).toHaveLength(1);
      expect(separators[0].textContent).toBe('·');
    });

    test('places the separator between the two links', () => {
      renderer.render(document, data);

      const parts = [...document.querySelector('.social-links').children].map(
        (child) => child.className
      );

      expect(parts).toEqual(['', 'inline-separator', '']);
    });

    test('keeps the separator out of the accessibility tree', () => {
      renderer.render(document, data);

      const separator = document.querySelector('.social-links .inline-separator');
      expect(separator.getAttribute('aria-hidden')).toBe('true');
    });

    test('emits no separator for a single link', () => {
      renderer.render(document, {
        social: [{ platform: 'GitHub', url: 'https://github.com/PigLardLord' }]
      });

      expect(document.querySelectorAll('.social-links .inline-separator')).toHaveLength(0);
    });
  });
});

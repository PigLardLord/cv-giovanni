import { InterestsRenderer } from '../renderers/InterestsRenderer.js';
import { JSDOM } from 'jsdom';

describe('InterestsRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="interests"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = new InterestsRenderer();
  });

  const container = () => document.getElementById('interests');

  test('renders the interests as one comma-separated line', () => {
    renderer.render(document, {
      interests: ['Mobile Architecture', 'Robotics & IoT', 'Mountain Hiking']
    });

    expect(container().textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Mobile Architecture, Robotics & IoT, Mountain Hiking'
    );
  });

  test('emits no pill tags', () => {
    renderer.render(document, { interests: ['Mobile Architecture', 'Tech Mentoring'] });

    expect(container().querySelectorAll('.tag')).toHaveLength(0);
    expect(container().querySelectorAll('.interests-line')).toHaveLength(1);
  });

  test('escapes rather than interprets markup in the data', () => {
    renderer.render(document, { interests: ['<script>x</script>'] });

    expect(container().querySelectorAll('script')).toHaveLength(0);
  });

  test('handles missing or empty interests gracefully', () => {
    expect(() => renderer.render(document, {})).not.toThrow();
    expect(() => renderer.render(document, { interests: null })).not.toThrow();

    renderer.render(document, { interests: [] });
    expect(container().textContent.trim()).toBe('');
  });

  test('handles a missing container', () => {
    const dom = new JSDOM('<html><body></body></html>');

    expect(() => {
      renderer.render(dom.window.document, { interests: ['Robotics & IoT'] });
    }).not.toThrow();
  });
});

test('gives every interest its own element while the line still reads as it did', () => {
  document.body.innerHTML = '<section><div id="interests"></div></section>';
  new InterestsRenderer().render(document, { interests: ['Robotics & IoT', 'Mountain Hiking'] });
  const chips = [...document.querySelectorAll('.interest-chip')].map((chip) => chip.textContent);
  expect(chips).toEqual(['Robotics & IoT', 'Mountain Hiking']);
  expect(document.querySelector('.interests-line').textContent).toBe(
    'Robotics & IoT, Mountain Hiking'
  );
});

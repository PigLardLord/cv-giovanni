import { JSDOM } from 'jsdom';
import { SkillsRenderer } from '../renderers/SkillsRenderer.js';

describe('SkillsRenderer', () => {
  const document = new JSDOM('<!doctype html><html><body><div id="skills"></div></body></html>')
    .window.document;

  beforeEach(() => { document.getElementById('skills').innerHTML = ''; });

  test('renders grouped skills as compact categorized text', () => {
    new SkillsRenderer().render(document, { skills: [{
      category: 'iOS',
      items: [{ name: 'Swift', level: 5 }, { name: 'SwiftUI', level: 4 }]
    }] });

    expect(document.querySelector('.skill-category').textContent).toBe('iOS:');
    expect(document.querySelector('.skill-list').textContent).toBe('Swift, SwiftUI');
    expect(document.querySelector('.skill-level')).toBeNull();
  });

  test('keeps the legacy flat profile readable without ratings', () => {
    new SkillsRenderer().render(document, {
      skills: [{ name: 'Swift', level: 5 }, { name: 'Git', level: 5 }]
    });

    expect(document.querySelector('.skill-list').textContent).toBe('Swift, Git');
    expect(document.getElementById('skills').textContent).not.toMatch(/[●○]/);
  });
});

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

    // The colon is punctuation, not content: it moved to CSS so a layout that sets the
    // category as a card heading is not stuck with a dangling one.
    expect(document.querySelector('.skill-category').textContent).toBe('iOS');
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

test('gives every skill its own element while the line still reads as it did', () => {
  // A layout can now style each name — a chip, a pill — by hiding the separators. The
  // separators stay real text nodes, so copy/paste and any parser still see "Swift, SwiftUI"
  // rather than "SwiftSwiftUI": the same failure the PDF hit on hyphenated compounds.
  document.body.innerHTML = '<div id="skills"></div>';
  new SkillsRenderer().render(document, { skills: [{ category: 'iOS', items: [{ name: 'Swift' }, { name: 'SwiftUI' }] }] });
  const chips = [...document.querySelectorAll('.skill-chip')].map((chip) => chip.textContent);
  expect(chips).toEqual(['Swift', 'SwiftUI']);
  expect(document.querySelector('.skill-list').textContent).toBe('Swift, SwiftUI');
});

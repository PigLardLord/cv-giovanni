import { LayoutResolver } from '../core/LayoutResolver.js';

describe('LayoutResolver', () => {
  const resolver = new LayoutResolver();

  // Technical Profile is the CV's one layout, and a link with no ?layout= opens it (#231, #362).
  test('uses technical by default', () => {
    expect(resolver.resolve('')).toBe('technical');
  });

  test.each(['nerd', 'technical'])('accepts %s', (layout) => {
    expect(resolver.resolve(`?layout=${layout}`)).toBe(layout);
  });

  // An old link to the retired Impact Spotlight still opens the CV (#362).
  test.each(['spotlight', 'unknown'])('opens technical for ?layout=%s', (layout) => {
    expect(resolver.resolve(`?layout=${layout}`)).toBe('technical');
  });
});

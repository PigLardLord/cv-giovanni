import { LayoutResolver } from '../core/LayoutResolver.js';

describe('LayoutResolver', () => {
  const resolver = new LayoutResolver();

  test('uses spotlight by default', () => {
    expect(resolver.resolve('')).toBe('spotlight');
  });

  test.each(['nerd', 'spotlight', 'technical'])('accepts %s', (layout) => {
    expect(resolver.resolve(`?layout=${layout}`)).toBe(layout);
  });

  test('rejects unknown layouts', () => {
    expect(resolver.resolve('?layout=unknown')).toBe('spotlight');
  });
});

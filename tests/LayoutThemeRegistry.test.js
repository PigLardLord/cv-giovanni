import { LayoutThemeRegistry } from '../adapters/LayoutThemeRegistry.js';

test('resolves every layout in color and monochrome', () => {
  const registry = new LayoutThemeRegistry();
  expect(registry.supported()).toEqual(['classic', 'spotlight', 'technical']);
  for (const layout of registry.supported()) {
    expect(registry.resolve(layout, 'color').primary).toMatch(/^#/);
    expect(registry.resolve(layout, 'monochrome').primary).toBe('#111111');
  }
});

test('rejects an unknown layout', () => {
  expect(() => new LayoutThemeRegistry().resolve('future-layout')).toThrow('Unsupported PDF layout');
});

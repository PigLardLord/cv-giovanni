import { LayoutThemeRegistry } from '../adapters/LayoutThemeRegistry.js';
import { PdfDesignSystem } from '../adapters/PdfDesignSystem.js';

const isGrey = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return r === g && g === b;
};

describe('monochrome output carries no colour', () => {
  const registry = new LayoutThemeRegistry();

  test.each(registry.supported())('%s in monochrome resolves every colour to a true grey', (layout) => {
    const theme = registry.resolve(layout, 'monochrome');
    const coloured = Object.entries(theme)
      .filter(([, value]) => typeof value === 'string' && value.startsWith('#'))
      .filter(([, value]) => !isGrey(value));
    expect(coloured).toEqual([]);
  });

  test('the design system takes its text colours from the theme, not from constants', () => {
    // Body and metadata used to be hardcoded, so a monochrome export still shipped slate text:
    // the theme said grey and the type said #334155, and only the rendered pixels disagreed.
    const mono = registry.resolve('spotlight', 'monochrome');
    const resolved = new PdfDesignSystem().resolve(mono);
    const colours = [resolved.defaultStyle.color, ...Object.values(resolved.styles).map((s) => s.color)]
      .filter((value) => typeof value === 'string' && value.startsWith('#'));
    expect(colours.length).toBeGreaterThan(0);
    expect(colours.filter((value) => !isGrey(value))).toEqual([]);
  });
});

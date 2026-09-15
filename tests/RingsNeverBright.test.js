import { readFileSync } from 'node:fs';

// The skins' bright tones mark geometry and never a word, and a focus ring is read like one. Drawn in them, the
// rings measured under 3:1 on the layout switcher, beside its current link and on Spotlight's ember masthead
// (#121), as the Download link's had behind it and along its shadow (#59, #107). So no stylesheet the page loads
// draws a ring in a bright tone.
const BRIGHT = ['--e-ember-bright', '--t-blue-bright'];

const brightRings = (css) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.includes(':focus'))
    .flatMap(([, selector, body]) =>
      body
        .split(';')
        .map((declaration) => declaration.trim())
        .filter((declaration) => /^outline(-color)?\s*:/.test(declaration))
        .filter((declaration) => BRIGHT.some((token) => declaration.includes(token)))
        .map((declaration) => `${selector.trim().replace(/\s+/g, ' ')} { ${declaration} }`)
    );

describe('a focus ring is never drawn in a bright tone', () => {
  test.each(['style.css', 'layouts.css', 'design-glacier.css'])('in %s', (sheet) => {
    expect(brightRings(readFileSync(new URL(`../${sheet}`, import.meta.url), 'utf8'))).toEqual([]);
  });

  test('and the check finds one drawn inside a media query', () => {
    const sheet = `@media screen {\n  body[data-layout='spotlight'] a:focus-visible {\n    outline: 2px solid var(--e-ember-bright);\n  }\n}\n`;
    expect(brightRings(sheet)).toEqual([
      "body[data-layout='spotlight'] a:focus-visible { outline: 2px solid var(--e-ember-bright) }"
    ]);
  });
});

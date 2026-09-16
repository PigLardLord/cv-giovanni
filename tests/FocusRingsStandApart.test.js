/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// In Impact Spotlight and Technical Profile, the layout switcher's current link and the Download button are filled
// with the skin's deep tone, and every focus ring was drawn in that same tone: 2px wide, 2px out, around a fill of its
// own colour, a focused control read as a second border rather than as focus (#130). A filled control's ring takes a
// colour its fill does not use.
const css = readFileSync(new URL('../design-glacier.css', import.meta.url), 'utf8');

/** Every rule without a nested block: its selectors and its declarations, in source order. */
const rules = (source) =>
  [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selectors, body]) => ({
      selectors: selectors.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')),
      declarations: Object.fromEntries(
        body
          .split(';')
          .map((declaration) => declaration.split(':'))
          .filter((pair) => pair.length >= 2)
          .map(([name, ...value]) => [name.trim(), value.join(':').trim()])
      )
    })
  );

const tokens = (value = '') => [...value.matchAll(/var\((--[\w-]+)\)/g)].map(([, token]) => token);

/** The last value a property takes for any of the selectors, as the cascade reads same-specificity rules in order. */
const lastValue = (all, selectors, property) =>
  all
    .filter((rule) => rule.selectors.some((selector) => selectors.includes(selector)))
    .map((rule) => rule.declarations[property])
    .filter(Boolean)
    .at(-1);

/** The ring a control's :focus-visible draws: its own rule's outline colour, or the skin's rule for its element. */
const ringTokens = (all, skin, control, element) => {
  const own = `body[data-layout='${skin}'] ${control}:focus-visible`;
  const shared = `body[data-layout='${skin}'] ${element}:focus-visible`;
  const colour =
    lastValue(all, [own], 'outline-color') ??
    lastValue(all, [own], 'outline') ??
    lastValue(all, [shared], 'outline-color') ??
    lastValue(all, [shared], 'outline');
  return tokens(colour);
};

const FILLED = [
  { control: ".layout-switcher a[aria-current='page']", element: 'a' },
  { control: '.print-button', element: 'a' }
];

/** Every filled control whose ring shares a colour token with its own fill. */
const sameAsFill = (source) => {
  const all = rules(source);
  return ['spotlight', 'technical'].flatMap((skin) =>
    FILLED.flatMap(({ control, element }) => {
      const fill = tokens(lastValue(all, [`body[data-layout='${skin}'] ${control}`], 'background'));
      const ring = ringTokens(all, skin, control, element);
      if (!fill.length || !ring.length) return [`${skin} ${control}: no fill or ring token found`];
      return ring.some((token) => fill.includes(token))
        ? [`${skin} ${control}: ring ${ring.join(' ')} on fill ${fill.join(' ')}`]
        : [];
    })
  );
};

describe('a filled control’s focus ring', () => {
  test('the check finds a ring drawn in its own fill’s colour', () => {
    const deep = `
      body[data-layout='technical'] .print-button { background: var(--t-blue-deep); }
      body[data-layout='technical'] a:focus-visible { outline: 2px solid var(--t-blue-deep); }
      body[data-layout='technical'] .layout-switcher a[aria-current='page'] { background: var(--t-ink); }
      body[data-layout='spotlight'] .print-button { background: linear-gradient(var(--e-ember), var(--e-ember-deep)); }
      body[data-layout='spotlight'] .layout-switcher a[aria-current='page'] { background: var(--e-ink); }
      body[data-layout='spotlight'] a:focus-visible { outline: 2px solid var(--e-ember-deep); }
    `;

    expect(sameAsFill(deep)).toEqual([
      'spotlight .print-button: ring --e-ember-deep on fill --e-ember --e-ember-deep',
      'technical .print-button: ring --t-blue-deep on fill --t-blue-deep'
    ]);
  });

  test('is never the colour of the fill it surrounds, in either skin', () => {
    expect(sameAsFill(css)).toEqual([]);
  });
});

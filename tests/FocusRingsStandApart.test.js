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

/** Every custom property the stylesheet defines, by name, as written (the last definition wins). */
const definitions = (all) =>
  new Map(
    all.flatMap((rule) =>
      Object.entries(rule.declarations).filter(([name]) => name.startsWith('--'))
    )
  );

/**
 * The colour tokens a value paints with, each followed through the custom properties it aliases to the last token
 * named: `--t-focus: var(--t-blue-deep)` paints `--t-blue-deep` (the code review of #172).
 */
const tokens = (value = '', defined = new Map(), seen = new Set()) =>
  [...value.matchAll(/var\((--[\w-]+)\)/g)].flatMap(([, token]) => {
    const alias = defined.get(token);
    if (seen.has(token) || !alias || !/var\(--/.test(alias)) return [token];
    return tokens(alias, defined, new Set([...seen, token]));
  });

/**
 * The value a property takes on a control, as the cascade picks it among the rules given: an important declaration over
 * a normal one, then the more specific selector, then the later rule. Each of `outline` and `outline-color` sets the
 * ring's colour, so both are candidates (the code review of #172: a later shorthand, or an `!important` on the shared
 * rule, won in the browser while the check read an earlier longhand).
 * @param {object[]} all - The stylesheet's rules
 * @param {{ selector: string, rank: number }[]} selectors - The selectors that reach the control, most specific highest
 * @param {string[]} properties - The properties that set the value
 * @returns {string|undefined} The winning declaration's value
 */
const cascaded = (all, selectors, properties) =>
  all
    .flatMap((rule, order) =>
      selectors
        .filter(({ selector }) => rule.selectors.includes(selector))
        .flatMap(({ rank }) =>
          properties
            .filter((property) => rule.declarations[property])
            .map((property) => ({
              value: rule.declarations[property],
              important: /!important/.test(rule.declarations[property]),
              rank,
              order
            }))
        )
    )
    .sort((a, b) => a.important - b.important || a.rank - b.rank || a.order - b.order)
    .at(-1)?.value;

/** The ring a control's :focus-visible draws, from its own rule and from the skin's rule for its element. */
const ringTokens = (all, skin, control, element) =>
  tokens(
    cascaded(
      all,
      [
        { selector: `body[data-layout='${skin}'] ${control}:focus-visible`, rank: 2 },
        { selector: `body[data-layout='${skin}'] ${element}:focus-visible`, rank: 1 }
      ],
      ['outline', 'outline-color']
    ),
    definitions(all)
  );

/** The fill a control paints, from `background` or `background-color`. */
const fillTokens = (all, skin, control) =>
  tokens(
    cascaded(
      all,
      [{ selector: `body[data-layout='${skin}'] ${control}`, rank: 1 }],
      ['background', 'background-color']
    ),
    definitions(all)
  );

const FILLED = [
  { control: ".layout-switcher a[aria-current='page']", element: 'a' },
  { control: '.print-button', element: 'a' }
];

/** Every filled control whose ring shares a colour token with its own fill. */
const sameAsFill = (source) => {
  const all = rules(source);
  return ['technical'].flatMap((skin) =>
    FILLED.flatMap(({ control, element }) => {
      const fill = fillTokens(all, skin, control);
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
    `;

    expect(sameAsFill(deep)).toEqual([
      'technical .print-button: ring --t-blue-deep on fill --t-blue-deep'
    ]);
  });

  // The code review of #172 reverted the ring to the fill's colour three ways the first check read as fine.
  test.each([
    [
      'a later outline shorthand on the control',
      `body[data-layout='technical'] .print-button:focus-visible { outline: 2px solid var(--t-blue-deep); }`
    ],
    [
      'an alias of the fill’s token',
      `body[data-layout='technical'] { --t-focus: var(--t-blue-deep); }
       body[data-layout='technical'] .print-button:focus-visible { outline-color: var(--t-focus); }`
    ],
    [
      'an important ring on the shared rule',
      `body[data-layout='technical'] a:focus-visible { outline: 2px solid var(--t-blue-deep) !important; }`
    ]
  ])('the check finds the fill’s colour brought back by %s', (how, rule) => {
    expect(sameAsFill(`${css}\n${rule}`)).toContain(
      'technical .print-button: ring --t-blue-deep on fill --t-blue-deep'
    );
  });

  test('a fill written as background-color is read too', () => {
    expect(
      sameAsFill(
        `${css}\nbody[data-layout='technical'] .print-button { background-color: var(--t-ink); }`
      )
    ).toContain('technical .print-button: ring --t-ink on fill --t-ink');
  });

  test('is never the colour of the fill it surrounds', () => {
    expect(sameAsFill(css)).toEqual([]);
  });
});

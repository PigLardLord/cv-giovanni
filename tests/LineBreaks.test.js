import {
  DASHES,
  SEPARATORS,
  columnOverflow,
  lineBoxes,
  lineBreaks,
  pageWidth,
  renderedGlyphs
} from '../scripts/lib/line-breaks.mjs';
import { DASH_GLYPHS, SEPARATOR_GLYPHS } from '../renderers/inlineSeparator.js';

/**
 * A run of text as Chrome lays it out on one line box: a rectangle per character, spaces narrower than letters, from
 * `left` along the line at `top`. `room` is how wide the line's block is, and `column` where its edges are.
 */
const run = (
  text,
  {
    top = 0,
    left = 0,
    height = 16,
    letter = 8,
    space = 4,
    room = 400,
    column = { left: 0, right: room }
  } = {}
) => {
  let x = left;
  return [...text].map((character) => {
    const width = /\s/u.test(character) ? space : letter;
    const glyph = {
      text: character,
      top,
      bottom: top + height,
      left: x,
      right: x + width,
      room,
      column
    };
    x += width;
    return glyph;
  });
};

/** Lines laid one under another, each starting at the left of the block. */
const block = (lines, options = {}) =>
  lines.flatMap((text, index) => run(text, { ...options, top: index * 20 }));

const profile = {
  relevant_experience: [{ period: 'September 2015 – July 2018' }],
  education: [{ school: 'Università degli Studi di Pisa', period: '2014 – 2016' }]
};

describe('the line boxes a page lays its text on', () => {
  test('a line is the characters that sit side by side at one height', () => {
    expect(
      lineBoxes(block(['Università degli Studi di Pisa (2014', '– 2016)'])).map((line) => line.text)
    ).toEqual(['Università degli Studi di Pisa (2014', '– 2016)']);
  });

  // A skill chip, a label beside its value: a row of separate elements reads as one line.
  test('text further along the same height is the same line, with a space where a gap parts it', () => {
    const glyphs = [...run('iOS', { left: 0 }), ...run('Swift', { left: 60 })];

    expect(lineBoxes(glyphs).map((line) => line.text)).toEqual(['iOS Swift']);
  });

  // Where the primary column ends and the secondary begins at the top of the page again.
  test('text that starts back up the page, or back at the left, starts a line', () => {
    const glyphs = [...run('Mountain Hiking', { top: 400 }), ...run('Education', { top: 0 })];

    expect(lineBoxes(glyphs).map((line) => line.text)).toEqual(['Mountain Hiking', 'Education']);
  });

  test('a space never makes a line of its own, and a line keeps no space at either end', () => {
    const glyphs = [
      ...run('Pisa ', { top: 0 }),
      ...run(' ', { top: 20, space: 0 }),
      ...run('(2009)', { top: 20 })
    ];

    expect(lineBoxes(glyphs).map((line) => line.text)).toEqual(['Pisa', '(2009)']);
  });
});

describe('a line break that strands a separator or splits a period', () => {
  // What the product review of #179 measured at Spotlight 1280px, on main.
  test('a separator that starts a line fails, and the finding shows the text either side of the break', () => {
    const { checks, findings } = lineBreaks(
      block(['Università degli Studi di Pisa (2014', '– 2016)']),
      profile
    );

    expect(checks.separatorsHeld).toBe(false);
    expect(findings.stranded).toEqual(['Studi di Pisa (2014 / – 2016)']);
  });

  test('a separator that ends a line fails', () => {
    const { checks, findings } = lineBreaks(
      block(['Swift · SwiftUI ·', 'Enterprise Mobility · CI/CD']),
      {}
    );

    expect(checks.separatorsHeld).toBe(false);
    expect(findings.stranded).toEqual(['Swift · SwiftUI · / Enterprise Mobility · CI/CD']);
  });

  test.each(['·', '–', '—', '|'])('%s is a separator', (glyph) => {
    expect(lineBreaks(block([`one ${glyph}`, 'two']), {}).checks.separatorsHeld).toBe(false);
  });

  test('separators inside their lines pass', () => {
    expect(
      lineBreaks(block(['Swift · SwiftUI · Enterprise Mobility · CI/CD', 'C1 — professional']), {})
        .checks.separatorsHeld
    ).toBe(true);
  });

  test('a period split across two lines fails, wherever it breaks', () => {
    const { checks, findings } = lineBreaks(
      block(['September 2015 – July', '2018 (2 years, 11 months)']),
      profile
    );

    expect(checks.periodsWhole).toBe(false);
    expect(findings.split).toEqual(['September 2015 – July / 2018 (2 years, 11']);
  });

  test('a period on one line passes', () => {
    const { checks, findings } = lineBreaks(
      block(['Università degli Studi di Pisa', '(2014 – 2016)', 'September 2015 – July 2018']),
      profile
    );

    expect(checks).toEqual({ separatorsHeld: true, periodsWhole: true });
    expect(findings).toEqual({ stranded: [], split: [] });
  });

  // At 320px Impact Spotlight has 172px for a role's dates, and "SEPTEMBER 2015 – JULY 2018" needs 200px. The least bad
  // break is after the dash: the line that ends there says the range goes on.
  describe('a period wider than its line', () => {
    const narrow = (lines, room) => block(lines, { room });
    // "September 2015 – July 2018" at 8px a letter and 4px a space: 22 letters and 4 spaces, 192px.
    test('may break after its dash, and the dash may end that line', () => {
      const { checks, findings } = lineBreaks(
        narrow(['September 2015 –', 'July 2018'], 180),
        profile
      );

      expect(checks).toEqual({ separatorsHeld: true, periodsWhole: true });
      expect(findings).toEqual({ stranded: [], split: [] });
    });

    test('measures the space the break swallowed as wide as the spaces it kept', () => {
      const glyphs = [
        ...run('September 2015 – ', { top: 0, room: 191 }),
        ...run('July 2018', { top: 20, room: 191 })
      ];
      glyphs[16].right = glyphs[16].left;

      expect(lineBreaks(glyphs, profile).checks.periodsWhole).toBe(true);
    });

    // Each end of a role's period is an element of its own, and the space between them a text node: where the line
    // breaks, Chrome gives that space no box at all.
    test('counts a space the break left no box for', () => {
      const glyphs = [
        ...run('May 2015 –', { top: 0, room: 158 }),
        { text: ' ', top: null, bottom: null, left: null, right: null, room: 158 },
        ...run('August 2015', { top: 20, room: 158 })
      ];
      const period = { period: 'May 2015 – August 2015' };

      // 18 letters and 4 spaces: 160px, wider than 158px; without the space the break took, 156px would fit.
      expect(lineBreaks(glyphs, period).checks.periodsWhole).toBe(true);
    });

    test('counts a run of spaces once, as the page collapses them', () => {
      const glyphs = [
        ...run('May 2015 – ', { top: 0, room: 162 }),
        { text: ' ', top: null, bottom: null, left: null, right: null, room: 162 },
        ...run('August 2015', { top: 20, room: 162 })
      ];

      expect(lineBreaks(glyphs, { period: 'May 2015 – August 2015' }).checks.periodsWhole).toBe(
        false
      );
    });

    test('never breaks before its dash', () => {
      const { checks } = lineBreaks(narrow(['September 2015', '– July 2018'], 180), profile);

      expect(checks).toEqual({ separatorsHeld: false, periodsWhole: false });
    });

    test('never breaks inside a date', () => {
      expect(
        lineBreaks(narrow(['September 2015 – July', '2018'], 180), profile).checks.periodsWhole
      ).toBe(false);
    });
  });

  test('a period that fits its line may not break even after its dash', () => {
    const { checks, findings } = lineBreaks(
      block(['September 2015 –', 'July 2018'], { room: 300 }),
      profile
    );

    expect(checks).toEqual({ separatorsHeld: false, periodsWhole: false });
    expect(findings.split).toEqual(['September 2015 – / July 2018']);
  });

  test('a period is any `period` the profile writes, however deep', () => {
    const nested = { sections: [{ entries: [{ period: 'May 2015 – August 2015' }] }] };

    expect(lineBreaks(block(['May 2015 – August', '2015']), nested).checks.periodsWhole).toBe(
      false
    );
  });
});

// Held text cannot wrap, however narrow its line (#198): "(Septembre 2015 – Décembre 2018 (3 ans 4 mois))" in a
// degree's never-wrapping period runs past a 320px column, and every other check still passes.
describe('text that runs past its column, or a page that scrolls sideways', () => {
  const page = { scrollWidth: 320, clientWidth: 320 };

  test('text inside its column, on a page no wider than its viewport, passes', () => {
    const { checks, findings } = columnOverflow(
      block(['September 2015 – July 2018', '(2014 – 2016)'], { room: 208 }),
      page
    );

    expect(checks).toEqual({ staysInColumn: true });
    expect(findings).toEqual({ overflowing: [], sideways: [] });
  });

  // "(Septembre 2015 – Décembre" is 196px at 8px a letter and 4px a space; the space after it ends at 200px.
  test('a glyph past the right edge of its column fails, naming the run past it, its line and how far', () => {
    const { checks, findings } = columnOverflow(
      run('(Septembre 2015 – Décembre 2018)', { room: 200 }),
      page
    );

    expect(checks.staysInColumn).toBe(false);
    expect(findings.overflowing).toEqual([
      '“2018)” in “(Septembre 2015 – Décembre 2018)”: 40.0px past the right edge of its column'
    ]);
  });

  test('a glyph before the left edge of its column fails', () => {
    const glyphs = run('Pisa', { column: { left: 16, right: 400 } });

    expect(columnOverflow(glyphs, page).findings.overflowing).toEqual([
      '“Pi” in “Pisa”: 16.0px past the left edge of its column'
    ]);
  });

  // Every glyph of both lines is past an edge of a column 8px wide, the last of one line and the first of the next too.
  test('a run keeps the spaces between the glyphs past the edge, names each line apart, and a whole line once', () => {
    const glyphs = block(['ab cd', 'ef gh'], { column: { left: 4, right: 12 } });

    expect(columnOverflow(glyphs, page).findings.overflowing).toEqual([
      '“ab cd”: 24.0px past the right edge of its column',
      '“ef gh”: 24.0px past the right edge of its column'
    ]);
  });

  test('a space at either end of a run stays out of its name', () => {
    const glyphs = run('x (3 ans) y', { column: { left: 0, right: 8 } });
    glyphs.at(-1).column = { left: 0, right: 400 };

    expect(columnOverflow(glyphs, page).findings.overflowing).toEqual([
      '“(3 ans)” in “x (3 ans) y”: 56.0px past the right edge of its column'
    ]);
  });

  test('a run parts two glyphs where a gap parts them, as its line does', () => {
    const glyphs = [...run('iOS'), ...run('Swift', { left: 60 })].map((glyph) => ({
      ...glyph,
      column: { left: 0, right: 0 }
    }));

    expect(columnOverflow(glyphs, page).findings.overflowing).toEqual([
      '“iOS Swift”: 100.0px past the right edge of its column'
    ]);
  });

  // Chrome lays text out in sixty-fourths of a pixel, and a box's padding comes back as a decimal: a line that fills
  // its column measured at most 0.0125px past it, over all twelve renders on main.
  test('a glyph up to half a pixel past its edge passes, and one further fails', () => {
    const within = run('a', { column: { left: 0, right: 7.5 } });
    const past = run('a', { column: { left: 0, right: 7.4 } });

    expect(columnOverflow(within, page).checks.staysInColumn).toBe(true);
    expect(columnOverflow(past, page).findings.overflowing).toEqual([
      '“a”: 0.6px past the right edge of its column'
    ]);
  });

  test('a space the page gave no box stays out of the judgement', () => {
    const glyphs = [
      ...run('May 2015 –', { room: 80 }),
      { text: ' ', top: null, bottom: null, left: null, right: null, room: 80 },
      ...run('August 2015', { top: 20, room: 88 })
    ];

    expect(columnOverflow(glyphs, page).checks.staysInColumn).toBe(true);
  });

  // Nerd Mode's container lets its content out: a planted period too wide for the editor widened the page to 429px at
  // 320px.
  test('a page wider than its viewport by more than a pixel fails, with every glyph inside its column', () => {
    const { checks, findings } = columnOverflow(block(['July 2018']), {
      scrollWidth: 429,
      clientWidth: 320
    });

    expect(checks.staysInColumn).toBe(false);
    expect(findings.sideways).toEqual([
      'the page scrolls sideways: 429px wide in a 320px viewport'
    ]);
  });

  test('a page a pixel wider than its viewport passes', () => {
    expect(
      columnOverflow(block(['July 2018']), { scrollWidth: 321, clientWidth: 320 }).checks
        .staysInColumn
    ).toBe(true);
  });
});

// The collector runs in the page, where no unit test reaches it, so here it runs in JSDOM, which lays nothing out:
// each range and element reports the box a stand-in gives it. Compiled and never run, a collector reading the wrong
// region would pass.
describe('the glyphs the audit collects from the page', () => {
  const box = (width, height = 16) => ({
    top: 0,
    bottom: height,
    left: 0,
    right: width,
    width,
    height
  });

  const originals = {
    rects: Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects'),
    drawn: Object.getOwnPropertyDescriptor(Element.prototype, 'getClientRects'),
    box: Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <p id="before">Download PDF</p>
      <header id="start"><h1>Giovanni</h1><p style="visibility: hidden">Hidden</p></header>
      <main id="end"><span class="clipped">Unseen</span><div id="room" style="padding: 0 10px">Pisa</div></main>
      <p id="after">After</p>`;
    // A space gets no box, the way Chrome gives none to the one a line broke at.
    Range.prototype.getClientRects = function () {
      return /^\s+$/.test(this.toString()) ? [] : [box(8)];
    };
    Element.prototype.getClientRects = function () {
      return this.classList.contains('undrawn') ? [] : [box(300)];
    };
    Element.prototype.getBoundingClientRect = function () {
      return this.classList.contains('clipped') ? box(1, 1) : box(300);
    };
  });

  afterEach(() => {
    const restore = (prototype, name, original) =>
      original ? Object.defineProperty(prototype, name, original) : delete prototype[name];
    restore(Range.prototype, 'getClientRects', originals.rects);
    restore(Element.prototype, 'getClientRects', originals.drawn);
    restore(Element.prototype, 'getBoundingClientRect', originals.box);
  });

  test('are every visible character from the first bound to the last, with the room and column of its line', () => {
    const glyphs = window.eval(renderedGlyphs('#start', '#end'));

    expect(
      glyphs
        .map((glyph) => glyph.text)
        .join('')
        .replace(/\s+/g, ' ')
    ).toBe('Giovanni Pisa');
    expect(glyphs[0]).toEqual({
      text: 'G',
      top: 0,
      bottom: 16,
      left: 0,
      right: 8,
      room: 300,
      column: { left: 0, right: 300 }
    });
    expect(glyphs.at(-1)).toMatchObject({ room: 280, column: { left: 10, right: 290 } });
  });

  // Every box here is 300px wide, so the inner block is drawn across its parent's padding: a box sized to what it
  // holds, an inline-block or a flex item, grows past its column with a period that cannot wrap, and the period stays
  // inside the box. Technical's role dates are one, at 320px (#198).
  test('take as a column the narrowest content box around the line: its own block and each block it sits in', () => {
    document.getElementById('room').innerHTML = '<div style="padding-right: 20px">Pisa</div>';
    const [glyph] = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyph).toMatchObject({ room: 280, column: { left: 10, right: 280 } });
  });

  // A link around a block draws a box per line of what it holds, not a column. JSDOM computes no display for a span, so
  // the span says it.
  test('take no column from an inline box the block sits in', () => {
    document.getElementById('room').innerHTML =
      '<span style="display: inline; padding: 0 40px"><div>Pisa</div></span>';
    const [glyph] = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyph.column).toEqual({ left: 10, right: 290 });
  });

  // Nerd Mode's editor hangs the first row of each line an indent to the left of the rows it wraps onto.
  test("take a first line's hanging indent into its column", () => {
    document.getElementById('room').innerHTML =
      '<div style="padding-left: 30px; text-indent: -12px">Pisa</div>';
    const [glyph] = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyph.column).toEqual({ left: 18, right: 290 });
  });

  test('take a box placed with absolute or fixed positioning as a column of its own', () => {
    document.getElementById('room').innerHTML =
      '<div style="position: absolute">Pisa</div><div style="position: fixed">Pisa</div>';
    const glyphs = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyphs.map((glyph) => glyph.column)).toEqual(Array(8).fill({ left: 0, right: 300 }));
  });

  test('keep a space with no box, where its element is drawn, and leave out one whose element is not', () => {
    document.getElementById('room').innerHTML =
      'May 2015 –<span> </span>August<span class="undrawn"> </span>';
    const glyphs = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyphs.map((glyph) => glyph.text).join('')).toBe('May 2015 – August');
    expect(glyphs[3]).toEqual({
      text: ' ',
      top: null,
      bottom: null,
      left: null,
      right: null,
      room: 280,
      column: { left: 10, right: 290 }
    });
  });

  test('are null when a bound is missing', () => {
    expect(window.eval(renderedGlyphs('#start', '#nowhere'))).toBeNull();
  });
});

describe('the width the audit reads off the page', () => {
  afterEach(() => {
    delete document.documentElement.scrollWidth;
    delete document.documentElement.clientWidth;
  });

  test('is how wide the page scrolls and how wide its viewport shows', () => {
    Object.defineProperty(document.documentElement, 'scrollWidth', {
      value: 429,
      configurable: true
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 320,
      configurable: true
    });

    expect(window.eval(pageWidth)).toEqual({ scrollWidth: 429, clientWidth: 320 });
  });
});

// The glyphs the audit holds to a line are the glyphs the renderers hold together, from one list: a glyph added to
// one and not the other would be held on screen and never checked, or checked and never held (code review of #195).
describe('the glyphs the check knows', () => {
  test('are the separators and dashes the renderers hold', () => {
    expect(SEPARATORS).toBe(SEPARATOR_GLYPHS);
    expect(DASHES).toBe(DASH_GLYPHS);
  });
});

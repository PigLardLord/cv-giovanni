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
  /** The CV's text with no syntax drawn beside it, as the layouts but Nerd Mode lay it. */
  const glyphsAlone = (glyphs, widths) => columnOverflow({ glyphs, syntax: [] }, widths);

  test('text inside its column, on a page no wider than its viewport, passes', () => {
    const { checks, findings } = glyphsAlone(
      block(['September 2015 – July 2018', '(2014 – 2016)'], { room: 208 }),
      page
    );

    expect(checks).toEqual({ staysInColumn: true });
    expect(findings).toEqual({ overflowing: [], sideways: [] });
  });

  // "(Septembre 2015 – Décembre" is 196px at 8px a letter and 4px a space; the space after it ends at 200px.
  test('a glyph past the right edge of its column fails, naming the run past it, its line and how far', () => {
    const { checks, findings } = glyphsAlone(
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

    expect(glyphsAlone(glyphs, page).findings.overflowing).toEqual([
      '“Pi” in “Pisa”: 16.0px past the left edge of its column'
    ]);
  });

  // A box placed with fixed positioning is a column of its own and adds nothing to how wide the page scrolls: one at
  // 400px on a 320px viewport drew its text wholly off the screen and failed neither half of the check (code review
  // of #211). The viewport is every glyph's outermost column.
  test('a glyph past the right of the viewport fails, however wide its own column, and says the viewport', () => {
    const glyphs = run('Held', { left: 400, column: { left: 400, right: 600 } });

    expect(glyphsAlone(glyphs, page).findings.overflowing).toEqual([
      '“Held”: 112.0px past the right edge of the viewport'
    ]);
  });

  test('a glyph before the left of the viewport fails', () => {
    const glyphs = run('Held text', { left: -16, column: { left: -16, right: 300 } });

    expect(glyphsAlone(glyphs, page).findings.overflowing).toEqual([
      '“He” in “Held text”: 16.0px past the left edge of the viewport'
    ]);
  });

  // Every glyph of both lines is past an edge of a column 8px wide, the last of one line and the first of the next too.
  test('a run keeps the spaces between the glyphs past the edge, names each line apart, and a whole line once', () => {
    const glyphs = block(['ab cd', 'ef gh'], { column: { left: 4, right: 12 } });

    expect(glyphsAlone(glyphs, page).findings.overflowing).toEqual([
      '“ab cd”: 24.0px past the right edge of its column',
      '“ef gh”: 24.0px past the right edge of its column'
    ]);
  });

  test('a space at either end of a run stays out of its name', () => {
    const glyphs = run('x (3 ans) y', { column: { left: 0, right: 8 } });
    glyphs.at(-1).column = { left: 0, right: 400 };

    expect(glyphsAlone(glyphs, page).findings.overflowing).toEqual([
      '“(3 ans)” in “x (3 ans) y”: 56.0px past the right edge of its column'
    ]);
  });

  test('a run parts two glyphs where a gap parts them, as its line does', () => {
    const glyphs = [...run('iOS'), ...run('Swift', { left: 60 })].map((glyph) => ({
      ...glyph,
      column: { left: 0, right: 0 }
    }));

    expect(glyphsAlone(glyphs, page).findings.overflowing).toEqual([
      '“iOS Swift”: 100.0px past the right edge of its column'
    ]);
  });

  // Chrome lays text out in sixty-fourths of a pixel, and a box's padding comes back as a decimal: a line that fills
  // its column measured at most 0.0125px past it, over all twelve renders on main.
  test('a glyph up to half a pixel past its edge passes, and one further fails', () => {
    const within = run('a', { column: { left: 0, right: 7.5 } });
    const past = run('a', { column: { left: 0, right: 7.4 } });

    expect(glyphsAlone(within, page).checks.staysInColumn).toBe(true);
    expect(glyphsAlone(past, page).findings.overflowing).toEqual([
      '“a”: 0.6px past the right edge of its column'
    ]);
  });

  test('a space the page gave no box stays out of the judgement', () => {
    const glyphs = [
      ...run('May 2015 –', { room: 80 }),
      { text: ' ', top: null, bottom: null, left: null, right: null, room: 80 },
      ...run('August 2015', { top: 20, room: 88 })
    ];

    expect(glyphsAlone(glyphs, page).checks.staysInColumn).toBe(true);
  });

  // Nerd Mode's container lets its content out: a planted period too wide for the editor widened the page to 429px at
  // 320px.
  test('a page wider than its viewport by more than a pixel fails, with every glyph inside its column', () => {
    const { checks, findings } = glyphsAlone(block(['July 2018']), {
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
      glyphsAlone(block(['July 2018']), { scrollWidth: 321, clientWidth: 320 }).checks.staysInColumn
    ).toBe(true);
  });

  // Nerd Mode's quotes, commas and brackets are drawn by the stylesheet and have no glyphs (#160). At 320px the closing
  // `",` of "September 2015 – July 2018" took 14.4px of its 16px, and a longer period would have pushed it into the
  // editor's padding with every check passing (#207).
  describe('with the syntax the stylesheet draws beside the text', () => {
    /** A piece of syntax from `left`, drawn after the `after`th glyph: a box, 8px a character, and no glyph. */
    const piece = (text, after, { top = 0, left = 0, column = { left: 0, right: 400 } } = {}) => ({
      text,
      top,
      bottom: top + 16,
      left,
      right: left + [...text].length * 8,
      column,
      after
    });
    // "September 2015 – July 2018" is 192px, its closing quote ends at 200px and its comma at 208px.
    const closed = (right) => {
      const column = { left: 0, right };
      return {
        glyphs: run('September 2015 – July 2018', { column }),
        syntax: [piece('"', 26, { left: 192, column }), piece(',', 26, { left: 200, column })]
      };
    };

    test('syntax inside its column passes', () => {
      const { checks, findings } = columnOverflow(closed(208), page);

      expect(checks).toEqual({ staysInColumn: true });
      expect(findings).toEqual({ overflowing: [], sideways: [] });
    });

    test('syntax past the right edge of its column fails, naming the line it follows and how far', () => {
      const { checks, findings } = columnOverflow(closed(206.8), page);

      expect(checks.staysInColumn).toBe(false);
      expect(findings.overflowing).toEqual([
        '“,” after “September 2015 – July 2018”: 1.2px past the right edge of its column'
      ]);
    });

    test('pieces of syntax side by side past an edge are one run, as far past as its furthest', () => {
      expect(columnOverflow(closed(198.8), page).findings.overflowing).toEqual([
        '“",” after “September 2015 – July 2018”: 9.2px past the right edge of its column'
      ]);
    });

    test('syntax up to half a pixel past its edge passes, and syntax further fails', () => {
      expect(columnOverflow(closed(207.5), page).checks.staysInColumn).toBe(true);
      expect(columnOverflow(closed(207.4), page).findings.overflowing).toEqual([
        '“,” after “September 2015 – July 2018”: 0.6px past the right edge of its column'
      ]);
    });

    test('syntax before any glyph is named by the line it comes before, and past the viewport says so', () => {
      const syntax = [piece('[', 0, { left: -16, column: { left: -16, right: 300 } })];

      expect(columnOverflow({ glyphs: run('Swift'), syntax }, page).findings.overflowing).toEqual([
        '“[” before “Swift”: 16.0px past the left edge of the viewport'
      ]);
    });

    test('syntax with no glyph at all is named by itself', () => {
      const syntax = [piece('}', 0, { left: 400 })];

      expect(columnOverflow({ glyphs: [], syntax }, page).findings.overflowing).toEqual([
        '“}”: 88.0px past the right edge of the viewport'
      ]);
    });

    // `let skills = [` at a width where the editor's line ends at 20px: a space the page writes, narrower than a gap
    // that would part them, parts "=" from "[", and the "]" that closes it sits on a line below.
    test('a run keeps a space the page writes between its pieces, and names each line apart', () => {
      const column = { left: 8, right: 20 };
      const glyphs = [
        ...run('let', { column: { left: 0, right: 400 } }),
        ...run(' ', { left: 40, space: 2 })
      ];
      const syntax = [
        piece('=', 3, { left: 32, column }),
        piece('[', 4, { left: 42, column }),
        piece(']', 4, { top: 20, left: 0, column })
      ];

      expect(columnOverflow({ glyphs, syntax }, page).findings.overflowing).toEqual([
        '“= [” after “let”: 30.0px past the right edge of its column',
        '“]” after “let”: 8.0px past the left edge of its column'
      ]);
    });

    test('a glyph between two pieces of syntax parts them, and every run is named in the order the page writes it', () => {
      const column = { left: 400, right: 600 };
      const glyphs = run('Held', { left: 400, column });
      const syntax = [
        piece('"', 0, { left: 392, column: { left: 392, right: 600 } }),
        piece('"', 4, { left: 432, column })
      ];

      expect(columnOverflow({ glyphs, syntax }, page).findings.overflowing).toEqual([
        '“"” before “Held”: 80.0px past the right edge of the viewport',
        '“Held”: 112.0px past the right edge of the viewport',
        '“"” after “Held”: 120.0px past the right edge of the viewport'
      ]);
    });
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
    const { glyphs } = window.eval(renderedGlyphs('#start', '#end'));

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
    const {
      glyphs: [glyph]
    } = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyph).toMatchObject({ room: 280, column: { left: 10, right: 280 } });
  });

  // A link around a block draws a box per line of what it holds, not a column. JSDOM computes no display for a span, so
  // the span says it.
  test('take no column from an inline box the block sits in', () => {
    document.getElementById('room').innerHTML =
      '<span style="display: inline; padding: 0 40px"><div>Pisa</div></span>';
    const {
      glyphs: [glyph]
    } = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyph.column).toEqual({ left: 10, right: 290 });
  });

  // Nerd Mode's editor hangs the first row of each line an indent to the left of the rows it wraps onto.
  test("take a first line's hanging indent into its column", () => {
    document.getElementById('room').innerHTML =
      '<div style="padding-left: 30px; text-indent: -12px">Pisa</div>';
    const {
      glyphs: [glyph]
    } = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyph.column).toEqual({ left: 18, right: 290 });
  });

  // `margin-left: 40px; padding-left: 10px; text-indent: -30px` hangs the first line 20px outside the block itself, into
  // its margin, and the column took it (code review of #211).
  test('take a hanging indent no further than the edge of its own block', () => {
    document.getElementById('room').innerHTML =
      '<div style="padding-left: 10px; text-indent: -30px">Pisa</div>';
    document.querySelector('#room > div').getBoundingClientRect = () => ({
      top: 0,
      bottom: 16,
      left: 40,
      right: 300,
      width: 260,
      height: 16
    });
    const {
      glyphs: [glyph]
    } = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyph.column).toEqual({ left: 40, right: 290 });
  });

  test('take a box placed with absolute or fixed positioning as a column of its own', () => {
    document.getElementById('room').innerHTML =
      '<div style="position: absolute">Pisa</div><div style="position: fixed">Pisa</div>';
    const { glyphs } = window.eval(renderedGlyphs('#room', '#room'));

    expect(glyphs.map((glyph) => glyph.column)).toEqual(Array(8).fill({ left: 0, right: 300 }));
  });

  test('keep a space with no box, where its element is drawn, and leave out one whose element is not', () => {
    document.getElementById('room').innerHTML =
      'May 2015 –<span> </span>August<span class="undrawn"> </span>';
    const { glyphs } = window.eval(renderedGlyphs('#room', '#room'));

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

  // Nerd Mode's quotes, commas and brackets are empty elements whose `data-code` the stylesheet draws with `::before`
  // (#160): no text, so no glyph, and the check never saw them (#207). The element's own boxes are the drawn text's,
  // one a line; JSDOM measures no text, so a stand-in pen gives every character half the drawn font's size.
  describe('with the syntax the stylesheet draws', () => {
    const computed = window.getComputedStyle;
    const pseudo = {
      fontStyle: 'normal',
      fontWeight: '400',
      fontSize: '16px',
      fontFamily: 'monospace',
      letterSpacing: 'normal',
      wordSpacing: '0px'
    };
    const drawnIn = (element, ...rects) => {
      element.getClientRects = () =>
        rects.map(([left, right, top = 0]) => ({
          left,
          right,
          top,
          bottom: top + 16,
          width: right - left,
          height: 16
        }));
    };

    beforeEach(() => {
      window.getComputedStyle = (element, pseudoElement) =>
        pseudoElement === '::before' ? pseudo : computed.call(window, element);
      HTMLCanvasElement.prototype.getContext = () => ({
        font: '',
        measureText(text) {
          return { width: ([...text].length * parseFloat(this.font.match(/(\d+)px/)[1])) / 2 };
        }
      });
    });

    afterEach(() => {
      window.getComputedStyle = computed;
      delete HTMLCanvasElement.prototype.getContext;
    });

    test('are each piece of it, with its box, its column and how many glyphs come before it', () => {
      document.getElementById('room').innerHTML =
        'Pisa<span data-code="&quot;"></span><span data-code=","></span>';
      const [quote, comma] = document.querySelectorAll('[data-code]');
      drawnIn(quote, [32, 40]);
      drawnIn(comma, [40, 48]);
      const { glyphs, syntax } = window.eval(renderedGlyphs('#room', '#room'));

      expect(glyphs).toHaveLength(4);
      expect(syntax).toEqual([
        {
          text: '"',
          top: 0,
          bottom: 16,
          left: 32,
          right: 40,
          column: { left: 10, right: 290 },
          after: 4
        },
        {
          text: ',',
          top: 0,
          bottom: 16,
          left: 40,
          right: 48,
          column: { left: 10, right: 290 },
          after: 4
        }
      ]);
    });

    test('leave out syntax outside the bounds, and syntax the page hides', () => {
      document.getElementById('room').innerHTML =
        '<span data-code="a"></span><span style="visibility: hidden" data-code="b"></span>' +
        '<span class="clipped" data-code="c"></span>';
      document.getElementById('after').innerHTML = '<span data-code="d"></span>';
      document.querySelectorAll('[data-code]').forEach((element) => drawnIn(element, [0, 8]));
      const { syntax } = window.eval(renderedGlyphs('#start', '#end'));

      expect(syntax.map((piece) => piece.text)).toEqual(['a']);
    });

    // Chrome hangs a space a `pre-wrap` line ends on past the edge, inside the box: at 320px Nerd Mode's " = " put
    // its first space 5.7px past the editor's content box, and the page scrolled no wider.
    test('take the spaces at either end of a piece out of its text and its box, since a line may hang them', () => {
      document.getElementById('room').innerHTML =
        '<span data-code="period: "></span><span data-code=" = "></span>';
      const [label, equals] = document.querySelectorAll('[data-code]');
      drawnIn(label, [10, 74]);
      drawnIn(equals, [74, 98]);
      const { syntax } = window.eval(renderedGlyphs('#room', '#room'));

      expect(syntax.map(({ text, left, right }) => ({ text, left, right }))).toEqual([
        { text: 'period:', left: 10, right: 66 },
        { text: '=', left: 82, right: 90 }
      ]);
    });

    test('split syntax a line wraps into what each line draws, and leave out a piece that draws only a space', () => {
      document.getElementById('room').innerHTML =
        '<span data-code=" = "></span><span data-code="Certification"></span>';
      const [equals, type] = document.querySelectorAll('[data-code]');
      drawnIn(equals, [282, 290], [10, 26, 20]);
      drawnIn(type, [26, 66, 20], [10, 74, 40]);
      const { syntax } = window.eval(renderedGlyphs('#room', '#room'));

      expect(syntax.map(({ text, top, left, right }) => ({ text, top, left, right }))).toEqual([
        { text: '=', top: 20, left: 10, right: 18 },
        { text: 'Certi', top: 20, left: 26, right: 66 },
        { text: 'fication', top: 40, left: 10, right: 74 }
      ]);
    });
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

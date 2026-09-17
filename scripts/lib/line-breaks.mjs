import { DASH_GLYPHS, SEPARATOR_GLYPHS } from '../../renderers/inlineSeparator.js';
import { CLOSING_MARKS } from '../../adapters/SwiftSourceLayout.js';

/**
 * Where the screen breaks the CV's lines, checked against what a break must never do (#180).
 *
 * The copy the screen audit reads has a space where a line broke, so a break in the wrong place reads as right: the
 * education line broke as "Università degli Studi di Pisa (2014" / "– 2016)" at Impact Spotlight's 1280px and the
 * selection still read "(2014 – 2016)". A date range split at its dash reads as two dates, and a line that starts
 * with a dash reads as a fragment. This reads the line boxes the page laid its text on instead: a rectangle per
 * character, taken in the page, and grouped into lines here, where each rule can be shown to fail.
 */

/** A glyph that stands between two things and belongs to neither, so it never starts or ends a line: the renderers'. */
export const SEPARATORS = SEPARATOR_GLYPHS;

/** The dashes a period writes between its two ends, after which a period too wide for its line may break. */
export const DASHES = DASH_GLYPHS;

/** How far a period may be from filling its line and still count as wider: glyph boxes add up to 1/64px apiece. */
const MEASURE_TOLERANCE = 0.5;

/**
 * Every visible character of the CV, from the first bound to the last, in the page's order: the box Chrome drew it
 * in, the room of the line it sits on — the content width of the block its line boxes fill — and the edges of its
 * column. The column is the narrowest content box around the line: its own block's, where a first line's hanging
 * indent belongs to it as far as the block's own edge, and each block's it sits in, since a box sized to what it holds
 * grows past its column with text that cannot wrap and keeps that text inside itself (#198). A box placed with
 * absolute or fixed positioning is put there on purpose, and is a column of its own, which `columnOverflow` still
 * holds inside the viewport. Each glyph carries the number of the block its line boxes fill, counted in the page's
 * order, so a row a block wraps onto is told from the first row of the next (#219). Text the page hides, with
 * `visibility` or clipped to a pixel the way text for a screen reader is, is left out. A space in a drawn element is
 * kept even with no box: Chrome gives none to a space a line broke at when it is a text node of its own.
 *
 * Beside the glyphs, the syntax the stylesheet draws: an empty element whose `data-code` its `::before` draws, as Nerd
 * Mode's quotes, commas and brackets are (#160). It has no text, so no glyph, and a range cannot reach inside a
 * pseudo-element; but the element's own boxes are the drawn text's, one a line (#207). A piece of syntax is what one
 * of those boxes draws, found by measuring the code in the font `::before` draws it in, and without the spaces at
 * either end: Chrome hangs a space a `pre-wrap` line ends on past the edge, inside the box, and a space is never
 * judged. Each piece carries how many glyphs come before it, so a finding can name the line it follows, and the
 * number of its block, as a glyph does.
 * @param {string} start - Selector of the CV's first element, as the audit's bounds name it
 * @param {string} end - Selector of its last
 * @returns {string} An expression for the page, resolving to `{ glyphs, syntax }`, or null when a bound is missing
 */
export const renderedGlyphs = (start, end) => `(() => {
  const first = document.querySelector(${JSON.stringify(start)});
  const last = document.querySelector(${JSON.stringify(end)});
  if (!first || !last) return null;
  const bounds = document.createRange();
  bounds.setStartBefore(first);
  bounds.setEndAfter(last);
  const flowing = (element) => ['inline', 'contents'].includes(getComputedStyle(element).display);
  const content = (element) => {
    const style = getComputedStyle(element);
    const inset = (side) =>
      (parseFloat(style['padding' + side]) || 0) + (parseFloat(style['border' + side + 'Width']) || 0);
    const drawn = element.getBoundingClientRect();
    const outer = drawn.left + scrollX;
    return { style, outer, left: outer + inset('Left'), right: drawn.right + scrollX - inset('Right') };
  };
  const places = new Map();
  const placeOf = (element) => {
    let holder = element;
    while (holder.parentElement && flowing(holder)) holder = holder.parentElement;
    if (!places.has(holder)) {
      const own = content(holder);
      const indent = own.style.textIndent.endsWith('px') ? Math.min(0, parseFloat(own.style.textIndent)) : 0;
      const column = { left: Math.max(own.outer, own.left + indent), right: own.right };
      for (let box = holder; box.parentElement && !['absolute', 'fixed'].includes(getComputedStyle(box).position); ) {
        box = box.parentElement;
        if (flowing(box)) continue;
        const around = content(box);
        column.left = Math.max(column.left, around.left);
        column.right = Math.min(column.right, around.right);
      }
      places.set(holder, { room: own.right - own.left, column, block: places.size });
    }
    return places.get(holder);
  };
  const pens = new Map();
  const widthIn = (style) => {
    const font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
    const spacing = [style.letterSpacing, style.wordSpacing].map((value) => (value === 'normal' ? '0px' : value));
    const key = [font, ...spacing].join('|');
    if (!pens.has(key)) {
      const pen = document.createElement('canvas').getContext('2d');
      pen.font = font;
      [pen.letterSpacing, pen.wordSpacing] = spacing;
      pens.set(key, (text) => pen.measureText(text).width);
    }
    return pens.get(key);
  };
  const glyphs = [];
  const syntax = [];
  const piece = document.createRange();
  const walker = document.createTreeWalker(bounds.commonAncestorContainer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const code = node.nodeType === Node.ELEMENT_NODE ? node.getAttribute('data-code') : null;
    if (node.nodeType === Node.ELEMENT_NODE && code === null) continue;
    if (!bounds.intersectsNode(node)) continue;
    const parent = code === null ? node.parentElement : node;
    if (getComputedStyle(parent).visibility !== 'visible') continue;
    const drawn = parent.getBoundingClientRect();
    if (drawn.width <= 1 && drawn.height <= 1) continue;
    const { room, column, block } = placeOf(parent);
    if (code !== null) {
      const width = widthIn(getComputedStyle(node, '::before'));
      const lines = [...node.getClientRects()].filter((rect) => rect.width > 0);
      let at = 0;
      lines.forEach((rect, index) => {
        let until = code.length;
        if (index < lines.length - 1) {
          until = at;
          while (until < code.length && width(code.slice(at, until + 1)) <= rect.width + 0.5) until++;
        }
        const text = code.slice(at, until);
        at = until;
        const ink = text.trim();
        if (!ink) return;
        const without = (kept) => (kept === text ? 0 : width(text) - width(kept));
        syntax.push({
          text: ink,
          top: rect.top + scrollY,
          bottom: rect.bottom + scrollY,
          left: rect.left + scrollX + without(text.trimStart()),
          right: rect.right + scrollX - without(text.trimEnd()),
          column,
          block,
          after: glyphs.length
        });
      });
      continue;
    }
    const shown = parent.getClientRects().length > 0;
    const text = node.data;
    for (let index = 0; index < text.length; ) {
      const size = text.codePointAt(index) > 0xffff ? 2 : 1;
      piece.setStart(node, index);
      piece.setEnd(node, index + size);
      const box = [...piece.getClientRects()].find((rect) => rect.width > 0 || rect.height > 0);
      if (box) {
        glyphs.push({
          text: text.slice(index, index + size),
          top: box.top + scrollY,
          bottom: box.bottom + scrollY,
          left: box.left + scrollX,
          right: box.right + scrollX,
          room,
          column,
          block
        });
      } else if (shown && /^\\s+$/.test(text.slice(index, index + size))) {
        const unboxed = { top: null, bottom: null, left: null, right: null };
        glyphs.push({ text: text.slice(index, index + size), ...unboxed, room, column, block });
      }
      index += size;
    }
  }
  return { glyphs, syntax };
})()`;

const blank = (glyph) => /^\s+$/u.test(glyph.text);

/** Two boxes share a line when they overlap by more than half the shorter one's height. */
const sideBySide = (before, after) =>
  Math.min(before.bottom, after.bottom) - Math.max(before.top, after.top) >
  Math.min(before.bottom - before.top, after.bottom - after.top) / 2;

/**
 * Whether a space parts two glyphs side by side: one the page writes between them, or a gap wider than a fifth of the
 * text's height.
 */
const parted = (previous, glyph, spaced) =>
  spaced || glyph.left - previous.right > (previous.bottom - previous.top) / 5;

/**
 * The lines, and every glyph in order with its index and the index of the line it sits on; a space takes the line
 * before it.
 */
function layOut(glyphs) {
  const lines = [];
  const laid = [];
  let spaced = false;
  for (const glyph of glyphs) {
    if (blank(glyph)) {
      spaced = true;
    } else {
      const line = lines[lines.length - 1];
      const previous = line?.glyphs[line.glyphs.length - 1];
      if (!previous || !sideBySide(previous, glyph) || glyph.left + 1 < previous.left) {
        lines.push({ text: glyph.text, glyphs: [glyph] });
      } else {
        line.text += (parted(previous, glyph, spaced) ? ' ' : '') + glyph.text;
        line.glyphs.push(glyph);
      }
      spaced = false;
    }
    laid.push({ glyph, line: lines.length - 1, index: laid.length });
  }
  return { lines, laid: laid.filter((entry) => entry.line >= 0) };
}

/**
 * The lines the glyphs sit on, in the page's order. A glyph starts a line unless it sits beside the one before it and
 * further along: a line that wraps goes down and back, and a column that begins goes back up. A space never starts a
 * line, and a line keeps none at either end; a space, or a gap wider than a fifth of the text's height, parts two
 * words.
 * @param {{ text: string, top: number, bottom: number, left: number, right: number }[]} glyphs - As `renderedGlyphs`
 *   collects them
 * @returns {{ text: string, glyphs: object[] }[]} Each line's text and its glyphs, spaces left out
 */
export const lineBoxes = (glyphs) => layOut(glyphs).lines;

/**
 * Every string the profile writes under a key named `period`, however deep. It is the key `core/ProfileShape.js` gives
 * every date range a role or a degree carries, so a date range under any other key would go unchecked: a new one
 * belongs under `period`, or here.
 */
const periodsIn = (node) =>
  Array.isArray(node)
    ? node.flatMap(periodsIn)
    : node && typeof node === 'object'
      ? Object.entries(node).flatMap(([key, value]) =>
          key === 'period' && typeof value === 'string' ? [value.trim()] : periodsIn(value)
        )
      : [];

/** The text either side of the break after a line: its last four words and the next line's first four. */
const acrossBreak = (before, after) =>
  [before?.text.split(' ').slice(-4).join(' '), after?.text.split(' ').slice(0, 4).join(' ')]
    .filter(Boolean)
    .join(' / ');

/**
 * How wide a run of glyphs would be on one line. A run of spaces counts once, as the page collapses it, and as wide as
 * the widest space the run kept a box for: a space a line broke at reports none.
 */
const widthOnOneLine = (glyphs) => {
  const space = Math.max(
    0,
    ...glyphs
      .filter((glyph) => blank(glyph) && glyph.right > glyph.left)
      .map((glyph) => glyph.right - glyph.left)
  );
  return glyphs.reduce(
    (sum, glyph, index) =>
      sum +
      (!blank(glyph)
        ? glyph.right - glyph.left
        : index > 0 && blank(glyphs[index - 1])
          ? 0
          : space),
    0
  );
};

/**
 * How far past its column's edge a glyph may be drawn and still count as inside. Chrome lays text out in sixty-fourths
 * of a pixel and reads a box's padding back as a decimal, so a line that fills its column measures a hair past it:
 * 0.0125px at most, over all twelve renders on main (#198). A glyph's box is its advance, not its ink, so an italic's
 * overhang never reaches it.
 */
const COLUMN_TOLERANCE = 0.5;

/** How much wider than its viewport a page may measure before it scrolls sideways: its widths are whole pixels. */
const PAGE_TOLERANCE = 1;

/** How wide the page scrolls, and how wide its viewport shows it: the root element's two widths. */
export const pageWidth = `({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth
})`;

/**
 * How far a glyph is drawn past its column, and past which edge of what; zero or less is inside. The viewport, as the
 * audit lays the page out, unscrolled, is every glyph's outermost column: a box placed with fixed positioning is a
 * column of its own and adds nothing to how wide the page scrolls, so text it draws off the screen would otherwise
 * pass (code review of #211).
 */
const pastColumn = (glyph, viewport) => {
  const right = Math.min(glyph.column.right, viewport);
  const left = Math.max(glyph.column.left, 0);
  const pastRight = glyph.right - right;
  const pastLeft = left - glyph.left;
  return pastRight >= pastLeft
    ? {
        by: pastRight,
        edge: 'right',
        of: right < glyph.column.right ? 'the viewport' : 'its column'
      }
    : { by: pastLeft, edge: 'left', of: left > glyph.column.left ? 'the viewport' : 'its column' };
};

/**
 * No text of the CV is drawn past its column or out of the viewport, and the page does not scroll sideways (#198). A
 * run the page holds together, a period or a separator with the words either side, cannot wrap however narrow its line
 * is, and a run too wide for its line runs past it. A space is never judged: one a line ends at hangs past the edge by
 * design, and one a break took has no box. A run of glyphs past an edge is named line by line, by its text and the line
 * it sits on, since a run can be a single letter, by the furthest any of its glyphs is, and by whether the edge is its
 * column's or the viewport's.
 *
 * The syntax the stylesheet draws is held to the same columns (#207). Nerd Mode's editor moves a period's closing `",`
 * to a line of its own rather than past its edge, only because its lines may break anywhere: with `overflow-wrap:
 * normal` they may not break before a quote, and at 320px a period two letters longer ran its `",` 12.8px past the
 * editor's content box, with every glyph inside it and the page no wider. Pieces of syntax side by side past an edge,
 * with nothing between them but a space the page writes, are one run, named by the line it follows, or the line it
 * comes before when no text comes before it. Runs are named in the order the page writes them.
 * @param {{ glyphs: object[], syntax: object[] }} drawn - As `renderedGlyphs` collects them: every glyph of the CV and
 *   every piece of syntax the stylesheet draws, each with its column's edges
 * @param {{ scrollWidth: number, clientWidth: number }} page - The page's widths, as `pageWidth` reads them: the
 *   viewport's is every glyph's outermost column
 * @returns {{ checks: { staysInColumn: boolean }, findings: { overflowing: string[], sideways: string[] } }} The check,
 *   each run past its column, and the page's width when it scrolls sideways
 */
export function columnOverflow({ glyphs, syntax }, page) {
  const { lines, laid } = layOut(glyphs);
  const runs = [];
  let open = null;
  let spaced = false;
  for (const { glyph, line, index } of laid) {
    if (blank(glyph)) {
      spaced = true;
      continue;
    }
    const past = pastColumn(glyph, page.clientWidth);
    if (past.by <= COLUMN_TOLERANCE) {
      open = null;
    } else if (open?.line === line) {
      open.text += (parted(open.last, glyph, spaced) ? ' ' : '') + glyph.text;
      open.last = glyph;
      if (past.by > open.by) Object.assign(open, past);
    } else {
      open = { line, at: index, text: glyph.text, last: glyph, ...past };
      runs.push(open);
    }
    spaced = false;
  }

  open = null;
  for (const piece of syntax) {
    const past = pastColumn(piece, page.clientWidth);
    const between = open ? glyphs.slice(open.last.after, piece.after) : [];
    if (past.by <= COLUMN_TOLERANCE) {
      open = null;
    } else if (open && between.every(blank) && sideBySide(open.last, piece)) {
      open.text += (parted(open.last, piece, between.length > 0) ? ' ' : '') + piece.text;
      open.last = piece;
      if (past.by > open.by) Object.assign(open, past);
    } else {
      // A piece drawn after the nth glyph comes before it in the page.
      open = { after: piece.after, at: piece.after - 0.5, text: piece.text, last: piece, ...past };
      runs.push(open);
    }
  }

  const named = (run) => {
    if (Object.hasOwn(run, 'line')) {
      const { text } = lines[run.line];
      return run.text === text ? `“${run.text}”` : `“${run.text}” in “${text}”`;
    }
    const before = laid.findLast((entry) => entry.index < run.after);
    const next = laid.find((entry) => entry.index >= run.after);
    const [word, entry] = before ? ['after', before] : ['before', next];
    return entry ? `“${run.text}” ${word} “${lines[entry.line].text}”` : `“${run.text}”`;
  };
  const overflowing = runs
    .sort((one, other) => one.at - other.at)
    .map((run) => `${named(run)}: ${run.by.toFixed(1)}px past the ${run.edge} edge of ${run.of}`);
  const sideways =
    page.scrollWidth > page.clientWidth + PAGE_TOLERANCE
      ? [
          `the page scrolls sideways: ${page.scrollWidth}px wide in a ${page.clientWidth}px viewport`
        ]
      : [];
  return {
    checks: { staysInColumn: overflowing.length === 0 && sideways.length === 0 },
    findings: { overflowing, sideways }
  };
}

/** The marks syntax that closes a literal begins with, as Nerd Mode's Swift file writes it. */
export const CLOSING_SYNTAX = CLOSING_MARKS;

/** How many quotes a piece of syntax draws. */
const quotesIn = (piece) => [...piece.text].filter((mark) => mark === '"').length;

/**
 * No row of Nerd Mode's editor opens with syntax that closes what the row above it wrote (#219). The editor's lines
 * may break anywhere, the drawn syntax included, and at 320px a longer period left its `",` a row of its own: a row
 * that opens with a lone `",` reads as broken code. A piece of syntax opens a row when the last thing drawn before it,
 * a glyph or a piece, is on a row above it in the same block; the first row of a block is a line of the file, and a `]`
 * may open that. It closes when it begins with a comma, a parenthesis, a bracket, or a quote after an odd number of
 * quotes in its block: Swift draws every quote that delimits a literal, and writes one inside a literal as text. Pieces
 * of syntax side by side after it, with no glyph between them but a space, are one run, named by the line of text it
 * follows in its block, or by itself when none does.
 * @param {{ glyphs: object[], syntax: object[] }} drawn - As `renderedGlyphs` collects them, each with its block
 * @returns {{ checks: { closingSyntaxHeld: boolean }, findings: { strandedSyntax: string[] } }} The check, and each run
 *   of closing syntax that opens a row
 */
export function closingSyntax({ glyphs, syntax }) {
  const { lines, laid } = layOut(glyphs);
  const letters = laid.filter((entry) => !blank(entry.glyph));
  const letterBefore = (piece) => letters.findLast((entry) => entry.index < piece.after);
  const quotes = new Map();
  const runs = [];
  let open = null;
  syntax.forEach((piece, index) => {
    const quotesBefore = quotes.get(piece.block) ?? 0;
    quotes.set(piece.block, quotesBefore + quotesIn(piece));
    const between = open ? glyphs.slice(open.last.after, piece.after) : [];
    if (open && between.every(blank) && sideBySide(open.last, piece)) {
      open.text += (parted(open.last, piece, between.length > 0) ? ' ' : '') + piece.text;
      open.last = piece;
      return;
    }
    open = null;
    const letter = letterBefore(piece);
    const earlier = syntax[index - 1];
    const previous = earlier && (!letter || earlier.after > letter.index) ? earlier : letter?.glyph;
    const opensRow = previous?.block === piece.block && !sideBySide(previous, piece);
    const [mark] = piece.text;
    const closes = CLOSING_SYNTAX.includes(mark) && (mark !== '"' || quotesBefore % 2 === 1);
    if (opensRow && closes) {
      open = { text: piece.text, last: piece, letter };
      runs.push(open);
    }
  });

  const strandedSyntax = runs.map(({ text, last, letter }) =>
    letter?.glyph.block === last.block
      ? `“${text}” opens a row after “${lines[letter.line].text}”`
      : `“${text}” opens a row`
  );
  return {
    checks: { closingSyntaxHeld: strandedSyntax.length === 0 },
    findings: { strandedSyntax }
  };
}

/**
 * How wide the syntax drawn flush against a run is: each piece side by side with the glyph or piece beside it, with no
 * glyph between and no gap a space would leave, going out from the run's first glyph and from its last.
 * @param {{ glyph: object, index: number }} first - The run's first glyph, as `layOut` lays it
 * @param {{ glyph: object, index: number }} last - Its last
 * @param {object[]} syntax - Every piece of syntax, in the page's order
 * @returns {number} The width of the pieces flush against either end
 */
const flushWidth = (first, last, syntax) => {
  let width = 0;
  let edge = first.glyph;
  for (const piece of syntax.filter((drawn) => drawn.after === first.index).reverse()) {
    if (!sideBySide(piece, edge) || parted(piece, edge, false)) break;
    width += piece.right - piece.left;
    edge = piece;
  }
  edge = last.glyph;
  for (const piece of syntax.filter((drawn) => drawn.after === last.index + 1)) {
    if (!sideBySide(edge, piece) || parted(edge, piece, false)) break;
    width += piece.right - piece.left;
    edge = piece;
  }
  return width;
};

/**
 * No line of the CV starts or ends with a separator, and no period the profile writes is split across two lines. A
 * period wider than its line cannot keep to one, and the least bad place for it to break is after its dash, where
 * the line that ends says the range goes on: there, and only there, it may break, and its dash may end the line.
 * Syntax drawn flush against either end of a period, with no space between, is part of the width it needs: Nerd Mode's
 * editor holds a literal's quotes and comma to its value, and at 320px "September 2015 – August 2018" fits a row
 * that `"September 2015 – August 2018",` does not (#219).
 * @param {object[]} glyphs - Every glyph of the CV, as `renderedGlyphs` collects them
 * @param {object} profile - The profile the page was rendered from
 * @param {object[]} [syntax] - The syntax the stylesheet draws beside the glyphs, as `renderedGlyphs` collects it
 * @returns {{ checks: { separatorsHeld: boolean, periodsWhole: boolean },
 *   findings: { stranded: string[], split: string[] } }} Each check, and the text either side of each break that
 *   failed it
 */
export function lineBreaks(glyphs, profile, syntax = []) {
  const { lines, laid } = layOut(glyphs);
  const letters = laid
    .map((entry, position) => ({ ...entry, position }))
    .filter((entry) => !blank(entry.glyph));
  const flat = letters.map((entry) => entry.glyph.text).join('');

  const split = [];
  const endsInDash = new Set();
  for (const period of new Set(periodsIn(profile).filter(Boolean))) {
    const target = period.replace(/\s+/gu, '');
    for (let at = flat.indexOf(target); at >= 0; at = flat.indexOf(target, at + 1)) {
      const own = letters.slice(at, at + target.length);
      const [first, final] = [own[0].line, own[own.length - 1].line];
      if (first === final) continue;
      const beforeBreak = own.filter((entry) => entry.line === first);
      const afterDash =
        final === first + 1 && DASHES.includes(beforeBreak[beforeBreak.length - 1].glyph.text);
      const run = laid.slice(own[0].position, own[own.length - 1].position + 1);
      const needs =
        widthOnOneLine(run.map((entry) => entry.glyph)) + flushWidth(own[0], own.at(-1), syntax);
      const wider = needs > own[0].glyph.room - MEASURE_TOLERANCE;
      if (afterDash && wider) endsInDash.add(first);
      else split.push(acrossBreak(lines[first], lines[first + 1]));
    }
  }

  const stranded = [];
  lines.forEach((line, index) => {
    if (SEPARATORS.includes(line.glyphs[0].text)) {
      stranded.push(acrossBreak(lines[index - 1], line));
    }
    if (SEPARATORS.includes(line.glyphs[line.glyphs.length - 1].text) && !endsInDash.has(index)) {
      stranded.push(acrossBreak(line, lines[index + 1]));
    }
  });

  return {
    checks: { separatorsHeld: stranded.length === 0, periodsWhole: split.length === 0 },
    findings: { stranded, split }
  };
}

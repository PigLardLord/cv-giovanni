import { DASH_GLYPHS, SEPARATOR_GLYPHS } from '../../renderers/inlineSeparator.js';

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
 * indent belongs to it, and each block's it sits in, since a box sized to what it holds grows past its column with
 * text that cannot wrap and keeps that text inside itself (#198). A box placed with absolute or fixed positioning is
 * put there on purpose, and is a column of its own. Text the page hides, with `visibility` or clipped to a pixel the
 * way text for a screen reader is, is left out. A space in a drawn element is kept even with no box: Chrome gives none
 * to a space a line broke at when it is a text node of its own.
 * @param {string} start - Selector of the CV's first element, as the audit's bounds name it
 * @param {string} end - Selector of its last
 * @returns {string} An expression for the page, resolving to the glyphs, or null when a bound is missing
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
    return { style, left: drawn.left + scrollX + inset('Left'), right: drawn.right + scrollX - inset('Right') };
  };
  const places = new Map();
  const placeOf = (element) => {
    let holder = element;
    while (holder.parentElement && flowing(holder)) holder = holder.parentElement;
    if (!places.has(holder)) {
      const own = content(holder);
      const indent = own.style.textIndent.endsWith('px') ? Math.min(0, parseFloat(own.style.textIndent)) : 0;
      const column = { left: own.left + indent, right: own.right };
      for (let box = holder; box.parentElement && !['absolute', 'fixed'].includes(getComputedStyle(box).position); ) {
        box = box.parentElement;
        if (flowing(box)) continue;
        const around = content(box);
        column.left = Math.max(column.left, around.left);
        column.right = Math.min(column.right, around.right);
      }
      places.set(holder, { room: own.right - own.left, column });
    }
    return places.get(holder);
  };
  const glyphs = [];
  const piece = document.createRange();
  const walker = document.createTreeWalker(bounds.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!bounds.intersectsNode(node)) continue;
    const parent = node.parentElement;
    if (getComputedStyle(parent).visibility !== 'visible') continue;
    const drawn = parent.getBoundingClientRect();
    if (drawn.width <= 1 && drawn.height <= 1) continue;
    const { room, column } = placeOf(parent);
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
          column
        });
      } else if (shown && /^\\s+$/.test(text.slice(index, index + size))) {
        const unboxed = { top: null, bottom: null, left: null, right: null };
        glyphs.push({ text: text.slice(index, index + size), ...unboxed, room, column });
      }
      index += size;
    }
  }
  return glyphs;
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

/** The lines, and every glyph in order with the index of the line it sits on; a space takes the line before it. */
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
    laid.push({ glyph, line: lines.length - 1 });
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

/** How far a glyph is drawn past its column, and past which edge; zero or less is inside. */
const pastColumn = (glyph) => {
  const right = glyph.right - glyph.column.right;
  const left = glyph.column.left - glyph.left;
  return right >= left ? { by: right, edge: 'right' } : { by: left, edge: 'left' };
};

/**
 * No text of the CV is drawn past its column, and the page does not scroll sideways (#198). A run the page holds
 * together, a period or a separator with the words either side, cannot wrap however narrow its line is, and a run too
 * wide for its line runs past it. A space is never judged: one a line ends at hangs past the edge by design, and one a
 * break took has no box. A run of glyphs past the edge is named line by line, by its text and the line it sits on,
 * since a run can be a single letter, and by the furthest any of its glyphs is.
 * @param {object[]} glyphs - Every glyph of the CV, as `renderedGlyphs` collects them, each with its column's edges
 * @param {{ scrollWidth: number, clientWidth: number }} page - The page's widths, as `pageWidth` reads them
 * @returns {{ checks: { staysInColumn: boolean }, findings: { overflowing: string[], sideways: string[] } }} The check,
 *   each run past its column, and the page's width when it scrolls sideways
 */
export function columnOverflow(glyphs, page) {
  const { lines, laid } = layOut(glyphs);
  const runs = [];
  let open = null;
  let spaced = false;
  for (const { glyph, line } of laid) {
    if (blank(glyph)) {
      spaced = true;
      continue;
    }
    const past = pastColumn(glyph);
    if (past.by <= COLUMN_TOLERANCE) {
      open = null;
    } else if (open?.line === line) {
      open.text += (parted(open.last, glyph, spaced) ? ' ' : '') + glyph.text;
      open.last = glyph;
      if (past.by > open.by) Object.assign(open, past);
    } else {
      open = { line, text: glyph.text, last: glyph, ...past };
      runs.push(open);
    }
    spaced = false;
  }

  const overflowing = runs.map(({ line, text, by, edge }) => {
    const named = text === lines[line].text ? `“${text}”` : `“${text}” in “${lines[line].text}”`;
    return `${named}: ${by.toFixed(1)}px past the ${edge} edge of its column`;
  });
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

/**
 * No line of the CV starts or ends with a separator, and no period the profile writes is split across two lines. A
 * period wider than its line cannot keep to one, and the least bad place for it to break is after its dash, where
 * the line that ends says the range goes on: there, and only there, it may break, and its dash may end the line.
 * @param {object[]} glyphs - Every glyph of the CV, as `renderedGlyphs` collects them
 * @param {object} profile - The profile the page was rendered from
 * @returns {{ checks: { separatorsHeld: boolean, periodsWhole: boolean },
 *   findings: { stranded: string[], split: string[] } }} Each check, and the text either side of each break that
 *   failed it
 */
export function lineBreaks(glyphs, profile) {
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
      const wider =
        widthOnOneLine(run.map((entry) => entry.glyph)) > own[0].glyph.room - MEASURE_TOLERANCE;
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

import { runningFooterText } from '../../core/RunningFooter.js';

/**
 * What the print audit asks of the line that says, from page 2 on, whose CV a page belongs to (#158).
 *
 * The line is composed by `core/RunningFooter.js` and printed in a page-margin box, which Chrome draws before the
 * page's content. So it is looked for where a reader and a parser meet it: as a line of its own in the bottom margin,
 * and at the page's end in both reading orders, never between two lines of the CV. Page 1 opens on the name already
 * and carries none.
 *
 * This module reads extracted text, line boxes and raster pixels, and nothing else: no browser, no poppler.
 */

/**
 * The nearest the footer may come to the paper's bottom edge, in millimetres. Office printers commonly leave about 4 to
 * 5mm of the sheet unprinted, and a footer there is cut off; 6mm clears that with room to spare. It is this project's
 * floor, not a standard's.
 */
export const RUNNING_FOOTER_FLOOR_MM = 6;

const MM_TO_PT = 72 / 25.4;
const collapse = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Each page of a `pdftotext` extract as its non-empty lines, whitespace collapsed.
 * @param {string} text - What `pdftotext` or `pdftotext -raw` wrote, which ends every page with a form feed
 * @returns {string[][]} The pages, in order
 */
export function textPages(text) {
  const pages = String(text).split('\f');
  // The form feed ends a page, so what follows the last one is not a page.
  if (pages.length > 1 && pages[pages.length - 1].trim() === '') pages.pop();
  return pages.map((page) => page.split('\n').map(collapse).filter(Boolean));
}

/** The lines on a page that read exactly as that page's footer. */
const footerLines = (page, text) => page.lines.filter((line) => collapse(line.text) === text);

/**
 * Everything wrong with a printed CV's running footer.
 * @param {{ pages: { height: number, lines: { text: string, top: number, bottom: number }[] }[], read: string,
 *   drawn: string }} printed - The pages from `bboxPages`, and the text as `pdftotext` and `pdftotext -raw` wrote it
 * @param {{ parts: (string|{ counter: string })[], bottomMargin: number, floor?: number }} expected - The footer's
 *   parts from `runningFooterParts`, the page's bottom margin in points, and the floor above the paper's edge in mm
 * @returns {string[]} One finding per fault, none for a sound CV
 */
export function runningFooterFindings(
  { pages, read, drawn },
  { parts, bottomMargin, floor = RUNNING_FOOTER_FLOOR_MM }
) {
  if (!parts.length) {
    return [
      'there is no running footer to look for: the profile has no name, or the catalogue writes no page count'
    ];
  }
  const count = pages.length;
  const readPages = textPages(read);
  const drawnPages = textPages(drawn);
  const findings = [];

  pages.forEach((page, index) => {
    const number = index + 1;
    const text = runningFooterText(parts, number, count);
    if (number === 1) {
      if (page.lines.some((line) => collapse(line.text).includes(text))) {
        findings.push(`page 1 carries the running footer "${text}"`);
      }
      return;
    }

    const [footer, ...more] = footerLines(page, text);
    if (!footer) {
      findings.push(`page ${number} carries no line reading "${text}"`);
      return;
    }
    if (more.length) findings.push(`page ${number} carries "${text}" ${more.length + 1} times`);

    const marginTop = page.height - bottomMargin;
    if (footer.top < marginTop) {
      findings.push(
        `page ${number}'s running footer starts ${(marginTop - footer.top).toFixed(1)}pt above the ${bottomMargin}pt ` +
          'bottom margin, in the text block'
      );
    }
    const clearance = (page.height - footer.bottom) / MM_TO_PT;
    if (clearance < floor) {
      findings.push(
        `page ${number}'s running footer ends ${clearance.toFixed(1)}mm from the paper's edge, under the ${floor}mm floor`
      );
    }

    const lines = readPages[index] ?? [];
    const last = lines[lines.length - 1];
    if (last !== text) {
      findings.push(
        `page ${number}'s running footer is not its last line as poppler reads the page: "${last ?? ''}" is`
      );
    }
    const strokes = drawnPages[index] ?? [];
    if (strokes[0] !== text && strokes[strokes.length - 1] !== text) {
      findings.push(
        `page ${number}'s running footer is neither the first nor the last line the page draws`
      );
    }
  });
  return findings;
}

/**
 * The pages with each one's running footer left out, for the room under the CV's own last line. The footer is told by
 * what it says, never by where it is: a line of the CV that runs into the margin still counts (the code review of
 * #168).
 * @param {{ lines: { text: string }[] }[]} pages - From `bboxPages`
 * @param {(string|{ counter: string })[]} parts - From `runningFooterParts`
 * @returns {object[]} The same pages, without the lines that read as their footer
 */
export function withoutRunningFooter(pages, parts) {
  if (!parts.length) return pages;
  return pages.map((page, index) => {
    const text = runningFooterText(parts, index + 1, pages.length);
    return { ...page, lines: page.lines.filter((line) => collapse(line.text) !== text) };
  });
}

/**
 * Where each page's running footer is, so its ink can be left out of the margin measure.
 * @param {{ lines: { text: string, left: number, top: number, right: number, bottom: number }[] }[]} pages - From
 *   `bboxPages`
 * @param {(string|{ counter: string })[]} parts - From `runningFooterParts`
 * @returns {{ left: number, top: number, right: number, bottom: number }[][]} Each page's footer boxes, in points
 */
export function footerBoxes(pages, parts) {
  return pages.map((page, index) =>
    parts.length
      ? footerLines(page, runningFooterText(parts, index + 1, pages.length)).map(
          ({ left, top, right, bottom }) => ({ left, top, right, bottom })
        )
      : []
  );
}

/**
 * A copy of a page's raster with boxes painted white, a pixel beyond each edge for the antialiasing around the glyphs,
 * as the contrast check reads a word's box. The raster itself is left as it was.
 * @param {{ width: number, height: number, pixels: Uint8Array }} page - One byte of grey per pixel, row by row
 * @param {{ left: number, top: number, right: number, bottom: number }[]} boxes - In points
 * @param {number} dpi - The raster's resolution
 * @returns {{ width: number, height: number, pixels: Uint8Array }} The painted copy
 */
export function paintedWhite(page, boxes, dpi) {
  const scale = dpi / 72;
  const pixels = Uint8Array.from(page.pixels);
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.left * scale) - 1);
    const y0 = Math.max(0, Math.floor(box.top * scale) - 1);
    const x1 = Math.min(page.width, Math.ceil(box.right * scale) + 1);
    const y1 = Math.min(page.height, Math.ceil(box.bottom * scale) + 1);
    for (let y = y0; y < y1; y += 1) pixels.fill(255, y * page.width + x0, y * page.width + x1);
  }
  return { ...page, pixels };
}

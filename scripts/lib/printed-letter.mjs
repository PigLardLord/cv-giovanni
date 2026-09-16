/**
 * What the print audit asks of a cover letter printed from letter.html (#151).
 *
 * A letter is not a CV. It is one page with no sections, its sender's name appears twice, and DIN 5008 form B
 * gives it a wider margin on the left than on the right on purpose. So it is scored on checks of its own, and
 * the rules that differ from the CV's live here, where each can be shown to fail on a letter that breaks it.
 *
 * This module reads the letter's words, a catalogue and measured margins, and nothing else: no browser, no poppler.
 */

/**
 * The parts of a letter in the order a reader meets them, as anchors for `outOfOrder`.
 *
 * Each is chosen so it cannot be found somewhere it is not. The address block is anchored by its first line, since a
 * later one, a country or a city, can also be in the sender's own letterhead; the date, the reference and the closing
 * fill whole lines of their own, one or, wrapped, several, so a short reference is not found inside a phone number;
 * and the signature, which repeats the letterhead's name, is looked for only after the closing.
 * @param {object} letter - The letter's words, from `LetterContent.of(...).letter`
 * @returns {(string | { lines: string } | { following: string })[]} The anchors, parts the letter leaves out
 *   left out
 */
export function letterAnchors(letter) {
  const line = (text) => text && { lines: text };
  return [
    letter.sender.name,
    letter.sender.contact,
    letter.returnAddress,
    letter.recipient[0],
    line(letter.date),
    line(letter.reference),
    letter.subject,
    letter.salutation,
    ...letter.paragraphs,
    letter.closingSentence,
    line(letter.closing),
    letter.signature && { following: letter.signature },
    letter.attachments
  ].filter(Boolean);
}

/**
 * A translator over the catalogues the page loads, reading `namespace:path.to.key` as i18next does, filling each
 * `{{placeholder}}` it is given a value for and leaving the rest as written, and giving back the key it cannot find,
 * all as i18next does. The audit composes the letter's words from the same catalogues the printed page was written in,
 * and a salutation greets by surname (#174).
 * @param {Record<string, object>} catalogues - Each namespace's catalogue, e.g. `{ cv, ui }`
 * @returns {(key: string, values?: Record<string, string>) => string} The translator
 */
export function catalogueTranslator(catalogues) {
  return (key, values = {}) => {
    const [namespace, path] = key.includes(':') ? key.split(':') : ['ui', key];
    const value = path.split('.').reduce((node, part) => node?.[part], catalogues[namespace]);
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (placeholder, name) =>
      Object.hasOwn(values, name) && values[name] != null ? String(values[name]) : placeholder
    );
  };
}

/**
 * Whether the ink on every page stands clear of every edge by the floor. The sides are not compared with each other,
 * as a CV's are: form B's 24.1mm on the left against 20mm on the right is the standard, not an overflow.
 * @param {{ left: number, top: number, right: number, bottom: number }[]} boxes - Each page's ink margins, in mm
 * @param {number} floor - The narrowest margin allowed, in mm
 * @returns {boolean} Whether every side of every page clears it, and there was a page to measure
 */
export function marginsClear(boxes, floor) {
  return (
    boxes.length > 0 &&
    boxes.every((box) => Math.min(box.left, box.top, box.right, box.bottom) >= floor)
  );
}

/**
 * DIN 5008 form B's address field, in millimetres from the page's top and left edges: 85mm by 45mm, 45mm down and
 * 20mm in. Its upper 17.7mm, the Zusatz- und Vermerkzone, is filled from the bottom and carries the return line at
 * its foot; its lower 27.3mm, the Anschriftzone, carries the recipient in at most six lines. A DL window envelope
 * shows it through a window running from 20mm to 110mm across.
 */
export const ADDRESS_FIELD = {
  remarks: { top: 45, bottom: 62.7 },
  address: { top: 62.7, bottom: 90 },
  across: { left: 20, right: 110 }
};

/** Chrome snaps a box to whole device pixels, 0.26mm at 96 dpi; a line off by less than that is where it was put. */
const TOLERANCE_MM = 0.3;

const PT_TO_MM = 25.4 / 72;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoded = (text) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] !== '#') return ENTITIES[name] ?? entity;
    const hex = name[1].toLowerCase() === 'x';
    return String.fromCodePoint(hex ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  });
const collapse = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * The lines of a PDF's first page as `pdftotext -bbox-layout` places them, in the order it gives them.
 * @param {string} xml - What `pdftotext -bbox-layout` wrote
 * @returns {{ text: string, top: number, bottom: number, left: number, right: number }[]} Each line's words joined
 *   by single spaces, and its box in millimetres from the page's top and left edges
 */
export function bboxLines(xml) {
  const first = String(xml).split(/<page\b/)[1] ?? '';
  return [
    ...first.matchAll(
      /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g
    )
  ].map(([, left, top, right, bottom, body]) => ({
    text: collapse(
      [...body.matchAll(/<word\b[^>]*>([^<]*)<\/word>/g)].map(([, word]) => decoded(word)).join(' ')
    ),
    top: Number(top) * PT_TO_MM,
    bottom: Number(bottom) * PT_TO_MM,
    left: Number(left) * PT_TO_MM,
    right: Number(right) * PT_TO_MM
  }));
}

/**
 * Whether a printed letter's address would show through a window envelope: the return line within the upper zone of
 * form B's address field, and every line of the recipient within the lower zone, all inside the window across.
 *
 * The recipient's lines are the ones after the return line that together write the recipient the letter names, so a
 * line wrapped inside the field is still the address, and a word elsewhere on the page is not.
 * @param {{ text: string, top: number, bottom: number, left: number, right: number }[]} lines - From `bboxLines`
 * @param {{ returnAddress: string, recipient: string[] }} letter - The letter's words, from `LetterContent`
 * @returns {string[]} Every line outside its zone, named with where it is; or what the page does not carry
 */
export function addressInWindow(lines, { returnAddress, recipient }) {
  const findings = [];
  const range = (from, to) => `${from.toFixed(1)}–${to.toFixed(1)}mm`;
  const place = (line, zone) => {
    const { across } = ADDRESS_FIELD;
    if (line.top < zone.top - TOLERANCE_MM || line.bottom > zone.bottom + TOLERANCE_MM) {
      findings.push(
        `"${line.text}" is ${range(line.top, line.bottom)} from the top, outside ${zone.top}–${zone.bottom}mm`
      );
    }
    if (line.left < across.left - TOLERANCE_MM || line.right > across.right + TOLERANCE_MM) {
      findings.push(
        `"${line.text}" is ${range(line.left, line.right)} from the left, outside ${across.left}–${across.right}mm`
      );
    }
  };

  let from = 0;
  const sender = collapse(returnAddress || '');
  if (sender) {
    // Wrapped, it fills the upper zone from its foot: every line of it has to be inside.
    const written = consecutiveLines(lines, 0, sender);
    if (!written) findings.push(`the return line "${sender}" is not on the page`);
    else {
      written.forEach((line) => place(line, ADDRESS_FIELD.remarks));
      from = lines.indexOf(written.at(-1)) + 1;
    }
  }

  const target = collapse((recipient || []).join(' '));
  if (!target) return findings;
  const address = consecutiveLines(lines, from, target);
  if (!address) {
    findings.push(`the address "${recipient.join(', ')}" is not on the page as lines of its own`);
    return findings;
  }
  address.forEach((line) => place(line, ADDRESS_FIELD.address));
  return findings;
}

/** The consecutive lines, from the first that can begin it, that together write the target and nothing more. */
function consecutiveLines(lines, from, target) {
  const continues = (written) =>
    target.startsWith(written) &&
    (written.length === target.length || target[written.length] === ' ');
  for (let start = from; start < lines.length; start += 1) {
    let written = '';
    for (let end = start; end < lines.length; end += 1) {
      const next = written ? `${written} ${lines[end].text}` : lines[end].text;
      if (!continues(next)) break;
      written = next;
      if (written === target) return lines.slice(start, end + 1);
    }
  }
  return null;
}

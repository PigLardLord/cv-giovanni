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
 * are lines of their own, so a short reference is not found inside a phone number; and the signature, which repeats
 * the letterhead's name, is looked for only after the closing.
 * @param {object} letter - The letter's words, from `LetterContent.of(...).letter`
 * @returns {(string | { heading: string } | { following: string })[]} The anchors, parts the letter leaves out
 *   left out
 */
export function letterAnchors(letter) {
  const line = (text) => text && { heading: text };
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
 * A translator over the catalogues the page loads, reading `namespace:path.to.key` as i18next does, and giving back
 * the key it cannot find, as i18next does. The audit composes the letter's words from the same catalogues the
 * printed page was written in.
 * @param {Record<string, object>} catalogues - Each namespace's catalogue, e.g. `{ cv, ui }`
 * @returns {(key: string) => string} The translator
 */
export function catalogueTranslator(catalogues) {
  return (key) => {
    const [namespace, path] = key.includes(':') ? key.split(':') : ['ui', key];
    const value = path.split('.').reduce((node, part) => node?.[part], catalogues[namespace]);
    return typeof value === 'string' ? value : key;
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

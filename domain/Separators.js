/**
 * The glyphs a line of the CV holds to the words either side of them, and where a period may break (#180).
 *
 * One list of each, read wherever a decision turns on them: the page's renderers hold a separator to its words, Nerd
 * Mode's Swift file finds where a value's last word begins (#219), and the audits check the lines the screen and the
 * print are laid on. A glyph added to a copy of a list would be held and never checked, or checked and never held (code
 * review of #195).
 */

/** The glyphs that stand between two things and belong to neither, so a line never starts or ends with one. */
export const SEPARATOR_GLYPHS = Object.freeze(['·', '–', '—', '|']);

/** The dashes a period writes between its two ends, the one place a period too wide for its line may break. */
export const DASH_GLYPHS = Object.freeze(['–', '—']);

/** A period's first end, up to and with its dash; the space after it; and its second end. */
const PERIOD_DASH = new RegExp(`^(.*?[${DASH_GLYPHS.join('')}])(\\s*)(.+)$`, 'su');

/**
 * A period's two ends, which never break inside, and the space the period writes between them.
 * @param {string} period - The period as the profile writes it
 * @returns {{ first: string, space: string, second: string }|null} Its ends, or null for a period with no dash
 */
export function periodEnds(period) {
  const [, first, space, second] = PERIOD_DASH.exec(String(period ?? '')) ?? [];
  return first ? { first, space, second } : null;
}

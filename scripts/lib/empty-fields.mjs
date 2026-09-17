import { certificationLine, roleHeader, schoolLine } from '../../domain/EntryLines.js';
import { SEPARATOR_GLYPHS } from '../../renderers/inlineSeparator.js';

/**
 * The traces a field the profile leaves out can leave in the printed text (#178).
 *
 * A profile may leave out a role's location, a degree's period, or a certification's issuer or year. The renderers once
 * wrote the punctuation around such a field whatever it held, "Engineer at Acme," and "Lead Essentials – Essential
 * Developer ()", and before that the word `undefined` (#169). The published profile fills every field, so the print
 * audit never met one. This reads the text layer for what an empty field leaves behind, whichever profile printed it:
 *
 * - empty brackets, `()`;
 * - `undefined` or `null` printed as a word, unless the profile writes that word itself ("Kotlin null safety");
 * - a separator doubled on its line, `· ·`, where whatever stood between the two printed nothing;
 * - an entry that ends on the separator of a part it does not have: a role header ending in a comma, a certification's
 *   name followed by a dash that introduces no issuer.
 *
 * It reads `pdftotext` output and nothing else, so each rule can be shown to fail on text that breaks it.
 */

const escapeForRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeInClass = (text) => text.replace(/[\]\\^-]/g, '\\$&');
const collapse = (text) => text.replace(/\s+/g, ' ').trim();

/** A separator: a comma, or a glyph that stands between two things and belongs to neither. */
const SEPARATOR = `[,${escapeInClass(SEPARATOR_GLYPHS.join(''))}]`;
const EMPTY_BRACKETS = /\(\s*\)/g;
const NOTHING_WORDS = ['undefined', 'null'];
const DOUBLED = new RegExp(`${SEPARATOR}[ \\t\\u00a0]*${SEPARATOR}`, 'g');

/** The lines a match printed on, from the start of its first to the end of its last, on one line. */
function linesAround(text, index, length) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index + length);
  return collapse(text.slice(start, end < 0 ? text.length : end));
}

/**
 * @param {string} text - The text layer, as `pdftotext` reads it
 * @param {{ ends?: string[], written?: string }} [profile] - What the profile says: `ends`, each entry as it prints up
 *   to a part it does not have, from `openEnds`; and `written`, every string it writes, whose words are its own
 * @returns {{ mark: string, line: string }[]} Every trace, in the order the text carries them: what printed, and the
 *   line it printed on; none for a text that carries none
 */
export function emptyFieldMarks(text, { ends = [], written = '' } = {}) {
  const found = [];
  const note = (index, mark) =>
    found.push({ index, mark: collapse(mark), line: linesAround(text, index, mark.length) });

  for (const match of text.matchAll(EMPTY_BRACKETS)) note(match.index, match[0]);
  for (const word of NOTHING_WORDS) {
    const pattern = new RegExp(`\\b${word}\\b`, 'g');
    if (new RegExp(pattern.source).test(written)) continue;
    for (const match of text.matchAll(pattern)) note(match.index, match[0]);
  }
  for (const match of text.matchAll(DOUBLED)) note(match.index, match[0]);
  // An entry's header opens its line in every layout; prose that names the entry mid-line and goes on is not one.
  for (const end of ends) {
    const words = String(end).split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const pattern = new RegExp(
      `^([ \\t]*)(${words.map(escapeForRegExp).join('\\s+')}\\s*${SEPARATOR})`,
      'gm'
    );
    for (const match of text.matchAll(pattern)) note(match.index + match[1].length, match[2]);
  }
  return found
    .sort((first, second) => first.index - second.index)
    .map(({ mark, line }) => ({ mark, line }));
}

const isGroup = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const entries = (list) => (Array.isArray(list) ? list.filter(isGroup) : []);
const textOf = (pieces) =>
  pieces.map((piece) => (typeof piece === 'string' ? piece : piece.text)).join('');
const prints = (pieces, field) => pieces.some((piece) => piece.field === field);

/**
 * Each entry of a profile as the page writes it, up to a part it does not have: where a separator left in front of that
 * part would print. The lines come from `domain/EntryLines.js`, as the renderers take them.
 * @param {object} profile - The profile
 * @param {{ at: string }} words - The catalogue's word between a role's title and its employer
 * @returns {string[]} A role's header without its location, a school without its period, a certification's name without
 *   its issuer, and its name and issuer without its year: roles, then schools, then certifications
 */
export function openEnds(profile, { at }) {
  const roles = entries(profile?.relevant_experience)
    .map((role) => roleHeader(role, at))
    .filter((pieces) => !prints(pieces, 'location'))
    .map(textOf);
  const schools = entries(profile?.education)
    .map((degree) => schoolLine(degree))
    .filter((pieces) => !prints(pieces, 'period'))
    .map(textOf);
  const certifications = entries(profile?.certifications).flatMap((certification) => {
    const name = String(certification.name ?? '').trim();
    const issuer = certificationLine({ issuer: certification.issuer });
    const year = certificationLine({ year: certification.year });
    const withIssuer = `${name}${issuer.join('')}`;
    return [...(issuer.length ? [] : [name]), ...(year.length ? [] : [withIssuer])];
  });
  return [...roles, ...schools, ...new Set(certifications)];
}

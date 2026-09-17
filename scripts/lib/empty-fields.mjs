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
 * - empty brackets, `()`, and `undefined` or `null` printed as a word, except where the text carries the profile's own
 *   words around them ("the legacy init() call", "Kotlin null safety");
 * - a separator doubled on its line, `· ·`, where whatever stood between the two printed nothing;
 * - an entry followed by the separator of a part it does not have, whatever comes after the separator: a role header
 *   with no location ending in a comma, "Mobile Developer at Apparound,", or going on after one, "Mobile Developer at
 *   Apparound, September 2015"; a certification's name followed by a dash that introduces no issuer, "Name – (2024)".
 *   After a part an entry leaves out only the rest of the entry's own line may follow, as `domain/EntryLines.js` writes
 *   it: "Name (2024)" (#212).
 *
 * Each entry answers only for its own line. Entries of a kind print in the profile's order, each opening a line, so
 * each is found at the first line its start opens after the one the entry before it of that kind was found at. Two
 * roles sharing a header, "Engineer at Acme" and "Engineer at Acme, Berlin", take their lines in turn, and the second's
 * comma, wrapped or not, is never blamed on the first (the code review of #205, and its re-check). A line that opens
 * with an entry's start before that entry's own line, a wrapped line of prose, would take its place in that order.
 *
 * It reads `pdftotext` output and nothing else, so each rule can be shown to fail on text that breaks it.
 */

const escapeForRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeInClass = (text) => text.replace(/[\]\\^-]/g, '\\$&');
const collapse = (text) => text.replace(/\s+/g, ' ').trim();

/** A separator: a comma, or a glyph that stands between two things and belongs to neither. */
const SEPARATOR = `[,${escapeInClass(SEPARATOR_GLYPHS.join(''))}]`;
/** What a field left empty prints instead of itself: its brackets with nothing inside, or the word for nothing. */
const EMPTY = [/\(\s*\)/g, /\bundefined\b/g, /\bnull\b/g];
const DOUBLED = new RegExp(`${SEPARATOR}[ \\t\\u00a0]*${SEPARATOR}`, 'g');

/**
 * Where the text carries what the profile writes around each match of `pattern` in it: the match with the word before
 * and the word after it, in any whitespace, a line break included, and with a compound's hyphen kept, left at a line's
 * end or welded shut. A match inside one of those is the profile's own; the same mark anywhere else is not (the code
 * review of #205). A string holding nothing but the mark has nothing to place it by, and exempts no occurrence at all.
 * @param {string} text - The text layer
 * @param {string[]} written - Every string the profile writes
 * @param {RegExp} pattern - The mark, with the global flag
 * @returns {[number, number][]} The ranges of the text that are the profile's own words
 */
function ownWords(text, written, pattern) {
  const ranges = [];
  for (const piece of written.map(String)) {
    const words = [...piece.matchAll(/\S+/g)].map((word) => ({
      start: word.index,
      end: word.index + word[0].length,
      text: word[0]
    }));
    for (const match of piece.matchAll(pattern)) {
      const first = words.findIndex((word) => word.end > match.index);
      const last = words.findLastIndex((word) => word.start < match.index + match[0].length);
      const context = words.slice(Math.max(0, first - 1), last + 2);
      const start = context[0].start;
      const end = context[context.length - 1].end;
      const beside = `${piece.slice(start, match.index)}${piece.slice(match.index + match[0].length, end)}`;
      if (!/\S/.test(beside)) continue;
      const around = context
        .map((word) => word.text.split('-').map(escapeForRegExp).join('(?:-\\s*)?'))
        .join('\\s+');
      for (const own of text.matchAll(new RegExp(around, 'g'))) {
        ranges.push([own.index, own.index + own[0].length]);
      }
    }
  }
  return ranges;
}

/** The lines a match printed on, from the start of its first to the end of its last, on one line. */
function linesAround(text, index, length) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index + length);
  return collapse(text.slice(start, end < 0 ? text.length : end));
}

/** Words in any whitespace, a line break included, as a pattern. */
const spaced = (text) =>
  String(text).split(/\s+/).filter(Boolean).map(escapeForRegExp).join('\\s+');

/** What `pattern` matches starting exactly at `index` of the text, or null. */
function matchAt(text, pattern, index) {
  const sticky = new RegExp(pattern, 'y');
  sticky.lastIndex = index;
  return sticky.exec(text);
}

/**
 * Where the first line at or after `from` opens with `start`, as a whole name: "Engineer at Apparound" does not open
 * "Engineer at Apparounds GmbH". Leading spaces are not the line's.
 * @returns {number} The index the start begins at, or -1 when no line opens with it
 */
function lineOpening(text, start, from) {
  const words = spaced(start);
  if (!words) return -1;
  const pattern = new RegExp(`^([ \\t]*)${words}(?![\\p{L}\\p{N}])`, 'gmu');
  pattern.lastIndex = from;
  const match = pattern.exec(text);
  return match ? match.index + match[1].length : -1;
}

/**
 * @param {string} text - The text layer, as `pdftotext` reads it
 * @param {{ entries?: { kind: string, start: string, line?: string, open: string[] }[], written?: string|string[] }}
 *   [profile] - What the profile says: `entries`, every entry it prints, from `printedEntries`; and `written`, every
 *   string it writes, whose words are its own
 * @returns {{ mark: string, line: string }[]} Every trace, in the order the text carries them: what printed, and the
 *   line it printed on; none for a text that carries none
 */
export function emptyFieldMarks(text, { entries = [], written = [] } = {}) {
  const found = [];
  const strings = [written].flat();
  const note = (index, mark) =>
    found.push({ index, mark: collapse(mark), line: linesAround(text, index, mark.length) });

  for (const pattern of EMPTY) {
    const own = ownWords(text, strings, pattern);
    for (const match of text.matchAll(pattern)) {
      if (!own.some(([start, end]) => match.index >= start && match.index < end)) {
        note(match.index, match[0]);
      }
    }
  }
  for (const match of text.matchAll(DOUBLED)) note(match.index, match[0]);
  // An entry's header opens its line in every layout; prose that names the entry mid-line and goes on is not one. Each
  // kind's entries take their lines in the profile's order, and each answers only for its own: its separator is a trace
  // where it follows a part the entry does not have, whatever comes after it, unless it is part of the entry's own line
  // as EntryLines writes it, read in any whitespace from where the entry opens (#212).
  const foundAt = new Map();
  for (const { kind, start, line = '', open } of entries) {
    const at = lineOpening(text, start, foundAt.get(kind) ?? 0);
    if (at < 0) continue;
    foundAt.set(kind, at + 1);
    const own = matchAt(text, spaced(line), at)?.[0].length ?? 0;
    for (const end of open) {
      const dangling = matchAt(text, `${spaced(end)}\\s*${SEPARATOR}`, at);
      if (dangling && dangling[0].length > own) note(at, dangling[0]);
    }
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
 * Every entry a profile prints, as the page writes its line: where the line opens, the whole line, and each part the
 * entry does not have, written up to that part, where a separator left in front of it would print. The lines come from
 * `domain/EntryLines.js`, as the renderers take them, so what may follow a part an entry leaves out is the rest of its
 * own line, "iOS Lead Essentials" then " (2024)", and never a rule written beside them (#212).
 * @param {object} profile - The profile
 * @param {{ at: string }} words - The catalogue's word between a role's title and its employer
 * @returns {{ kind: 'role'|'school'|'certification', start: string, line: string, open: string[] }[]} Roles, then
 *   schools, then certifications, each kind in the profile's order: a role opens with its title and employer and is
 *   open there without its location; a school opens with its name and is open there without its period; a
 *   certification opens with its name, and is open there without its issuer, and after its issuer without its year
 */
export function printedEntries(profile, { at }) {
  const roles = entries(profile?.relevant_experience).map((role) => {
    const start = textOf(roleHeader({ ...role, location: '' }, at)).trim();
    const header = roleHeader(role, at);
    const open = prints(header, 'location') ? [] : [start];
    return { kind: 'role', start, line: textOf(header).trim(), open };
  });
  const schools = entries(profile?.education).map((degree) => {
    const start = textOf(schoolLine({ ...degree, period: '' })).trim();
    const line = schoolLine(degree);
    return {
      kind: 'school',
      start,
      line: textOf(line).trim(),
      open: prints(line, 'period') ? [] : [start]
    };
  });
  const certifications = entries(profile?.certifications).map((certification) => {
    const start = String(certification.name ?? '').trim();
    const issuer = certificationLine({ issuer: certification.issuer });
    const year = certificationLine({ year: certification.year });
    const open = [
      ...(issuer.length ? [] : [start]),
      ...(year.length ? [] : [`${start}${issuer.join('')}`])
    ];
    const line = `${start}${certificationLine(certification).join('')}`;
    return { kind: 'certification', start, line, open: [...new Set(open)] };
  });
  return [...roles, ...schools, ...certifications];
}

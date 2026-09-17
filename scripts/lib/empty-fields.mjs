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
 * with an entry's start inside a string the profile writes that runs past it, a summary or a highlight naming a
 * later role, "Mobile Developer at Apparound alumni now lead two teams", is that string's line and never the entry's,
 * wherever it wraps, where the string prints more than the entry's own line: it neither takes the entry's line from it
 * nor is blamed for a separator of its own. A string the entry's line prints whole is not prose there (#213).
 *
 * Given the section each kind prints in, an entry is looked for only there: from the line its heading prints alone on
 * to the next line any section heading prints alone on. A copy of the entry's whole line printed outside it, a
 * highlight that reads exactly like the header, is not the entry's (the re-check of #213). Inside one section, two
 * lines that both print the entry's whole line, one of them prose, cannot be told apart from the text alone, and the
 * first is taken. A line of prose that is only a heading's words would be read as that heading.
 *
 * It reads `pdftotext` output and nothing else, so each rule can be shown to fail on text that breaks it.
 */

const escapeForRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeInClass = (text) => text.replace(/[\]\\^-]/g, '\\$&');
const collapse = (text) => text.replace(/\s+/g, ' ').trim();
/**
 * Words as a line breaks them, as a pattern: in any whitespace, a line break included, and with a compound's hyphen
 * kept, left at a line's end or welded shut.
 */
const brokenWords = (words) =>
  words.map((word) => word.split('-').map(escapeForRegExp).join('(?:-\\s*)?')).join('\\s+');

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
      const around = brokenWords(context.map((word) => word.text));
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
 * Where each string the profile writes that runs past `start` prints: a summary or a highlight that names the entry,
 * "Mobile Developer at Apparound alumni now lead two teams". A school's or a certification's name is the start itself,
 * and runs past nothing. Whether a range is prose where a line opens is the line's to say, in `lineOpening` (#213).
 * @param {string} text - The text layer
 * @param {string[]} written - Every string the profile writes
 * @param {string} start - Where the entry's line opens
 * @returns {[number, number][]} The ranges of the text those strings print over
 */
function proseNaming(text, written, start) {
  const name = collapse(start);
  const ranges = [];
  for (const piece of written.map((string) => collapse(String(string)))) {
    if (!name || piece === name || !piece.includes(name)) continue;
    for (const prose of text.matchAll(new RegExp(brokenWords(piece.split(' ')), 'g'))) {
      ranges.push([prose.index, prose.index + prose[0].length]);
    }
  }
  return ranges;
}

/**
 * Where the first line at or after `from` opens with the entry's `start`, as a whole name: "Engineer at Apparound" does
 * not open "Engineer at Apparounds GmbH". Leading spaces are not the line's.
 *
 * Nor is a start inside one of the `prose` ranges, where that range prints more than the entry's own `line` would from
 * there: words before the start, carried from the line above, or words past the end of the entry's line as it prints
 * there, or past the start where it does not. That line is the prose's, wherever it wraps (#213). A string the entry's
 * line prints, "Mobile Developer at Apparound, Pisa, Italy", prints nothing more on that line, which stays the entry's
 * with its trace (the code review of #213); printed on a line of its own, it is prose.
 * @param {string} text - The text layer
 * @param {{ start: string, line?: string }} entry - Where the entry's line opens, and the whole line
 * @param {number} from - Where to look from
 * @param {[number, number][]} [prose] - Where the strings that run past the start print, from `proseNaming`
 * @returns {number} The index the start begins at, or -1 when no line opens with it
 */
function lineOpening(text, { start, line = '' }, from, prose = []) {
  const words = spaced(start);
  if (!words) return -1;
  const pattern = new RegExp(`^([ \\t]*)${words}(?![\\p{L}\\p{N}])`, 'gmu');
  pattern.lastIndex = from;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const at = match.index + match[1].length;
    const end = match.index + match[0].length;
    const own = at + (matchAt(text, spaced(line), at)?.[0].length ?? 0);
    const inProse = ([first, last]) => first <= at && end <= last && (first < at || last > own);
    if (!prose.some(inProse)) return at;
  }
  return -1;
}

/**
 * Every line a heading prints alone on: its words on one line, in any whitespace but a line break, a page break before
 * a heading at the top of a page included, and nothing else.
 */
function headingLines(heading) {
  const words = String(heading ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeForRegExp);
  const space = '[^\\S\\n]';
  return words.length ? new RegExp(`^${space}*${words.join(`${space}+`)}${space}*$`, 'gm') : null;
}

/**
 * Where a section runs in the text: from the end of the first line its heading prints alone on, as the section order
 * check reads a heading (#142), to the start of the next line any of the `headings` prints alone on, or the text's end.
 * A heading that is not given, or does not print, bounds nothing, and the whole text is the section, as with no
 * section at all: an entry is never left unchecked because its heading was lost.
 * @param {string} text - The text layer
 * @param {string} [heading] - The section's heading
 * @param {string[]} headings - Every section heading the CV prints
 * @returns {[number, number]} Where the section starts and ends
 */
function sectionIn(text, heading, headings) {
  const opening = headingLines(heading)?.exec(text);
  if (!opening) return [0, text.length];
  const from = opening.index + opening[0].length;
  const ends = [heading, ...headings].map((other) => {
    const next = headingLines(other);
    if (!next) return text.length;
    next.lastIndex = from;
    return next.exec(text)?.index ?? text.length;
  });
  return [from, Math.min(...ends)];
}

/**
 * @param {string} text - The text layer, as `pdftotext` reads it
 * @param {{ entries?: { kind: string, start: string, line?: string, open: string[] }[], written?: string|string[],
 *   sections?: Record<string, string>, headings?: string[] }} [profile] - What the profile says: `entries`, every entry
 *   it prints, from `printedEntries`; `written`, every string it writes, whose words are its own; `sections`, the
 *   heading of the section each kind of entry prints in; and `headings`, every section heading the CV prints, where a
 *   section ends. `entrySections` gives the last two from the catalogue. A kind with no section is looked for in the
 *   whole text
 * @returns {{ mark: string, line: string }[]} Every trace, in the order the text carries them: what printed, and the
 *   line it printed on; none for a text that carries none
 */
export function emptyFieldMarks(
  text,
  { entries = [], written = [], sections = {}, headings = [] } = {}
) {
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
  // An entry's header opens its line in every layout; prose that names the entry is not one, whether it names it
  // mid-line or a line of it opens with the name (#213). Each kind's entries take their lines in the profile's order,
  // and each answers only for its own: its separator is a trace where it follows a part the entry does not have,
  // whatever comes after it, unless it is part of the entry's own line as EntryLines writes it, read in any whitespace
  // from where the entry opens (#212).
  const foundAt = new Map();
  const within = new Map();
  for (const { kind, start, line = '', open } of entries) {
    if (!within.has(kind)) within.set(kind, sectionIn(text, sections[kind], headings));
    const [from, to] = within.get(kind);
    const prose = proseNaming(text, strings, start);
    const at = lineOpening(text, { start, line }, foundAt.get(kind) ?? from, prose);
    if (at < 0 || at >= to) continue;
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

/**
 * The section each kind of entry prints in, and every heading that can end one, from the catalogue's section labels as
 * the page prints them: roles under the experience heading, schools under education, certifications under theirs.
 * @param {Record<string, string>} labels - The catalogue's `sections`
 * @returns {{ sections: { role: string, school: string, certification: string }, headings: string[] }} For
 *   `emptyFieldMarks`
 */
export function entrySections(labels) {
  return {
    sections: {
      role: labels.experience,
      school: labels.education,
      certification: labels.certifications
    },
    headings: Object.values(labels)
  };
}

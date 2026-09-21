import { inflateSync } from 'node:zlib';
import { WORD_CHARACTER } from '../../domain/Separators.js';

/**
 * Whether a printed page's text survives the extractors that read it without laying the page out (#143).
 *
 * Chrome embeds a variable web font as Type 3 fonts, each a set of drawn glyphs with a Unicode map on the
 * side, and several extractors have documented bugs with them. And a parser that reads in drawing order,
 * as PDFBox and Tika do by default, finds a word's end only where the page drew a space: the browser's
 * print gave it "MobileSoftwareEngineer" and "GiovanniTrovato".
 *
 * This module reads what the extractors and the file itself say — `pdffonts`, `pdftotext -raw`, a
 * `pdftohtml` read, and the `/ToUnicode` maps in the bytes — and nothing else, so each rule can be shown
 * to fail on a page that breaks it.
 */

// Every type pdffonts names, longest first so a longer name is not read as its prefix.
const FONT_TYPES = [
  'CID TrueType (OT)',
  'CID Type 0C (OT)',
  'TrueType (OT)',
  'Type 1C (OT)',
  'CID TrueType',
  'CID Type 0C',
  'CID Type 0',
  'TrueType',
  'Type 1C',
  'Type 1',
  'Type 3',
  'unknown'
];
const FONT_ROW = new RegExp(
  `^(.*?)\\s+(${FONT_TYPES.map((type) => type.replace(/[()]/g, '\\$&')).join('|')})\\s+\\S+\\s+(?:yes|no)\\s+(?:yes|no)\\s+(?:yes|no)\\s`
);

// The same row, with its three yes-or-no columns kept: embedded, subset, and whether it carries a map.
const FONT_FLAGS = new RegExp(
  `^(.*?)\\s+(?:${FONT_TYPES.map((type) => type.replace(/[()]/g, '\\$&')).join('|')})\\s+\\S+\\s+(yes|no)\\s+(yes|no)\\s+(yes|no)\\s`
);

/**
 * @param {string} pdffonts - The output of `pdffonts` for one PDF
 * @returns {string[]} The name of every Type 3 font it embeds
 */
export function type3Fonts(pdffonts) {
  // A row is read by what its fields are, not where they sit: pdffonts widens any column a value overruns, the
  // name, the encoding or the object number, and moves every column after it (the reviews of #156). A name can
  // hold spaces, even "Type 3"; the type is the one followed by an encoding and three yes-or-no columns.
  return pdffonts
    .split('\n')
    .slice(2)
    .map((row) => FONT_ROW.exec(row))
    .filter((match) => match && match[2] === 'Type 3')
    .map((match) => match[1].trim());
}

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The phrases a drawing-order read of the page runs together.
 *
 * A phrase is found with any whitespace between its words, a line break included; it is glued when any of
 * those gaps is empty. A phrase the text does not carry at all is the content check's to report.
 * @param {string} raw - The text layer in drawing order, from `pdftotext -raw`
 * @param {string[]} phrases - Text the profile writes with spaces in it: the name, titles, schools
 * @returns {string[]} The phrases whose words run together somewhere in the text
 */
export function gluedPhrases(raw, phrases) {
  return phrases.filter((phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    const pattern = new RegExp(words.map(escapeForRegExp).join('(\\s*)'), 'g');
    return [...raw.matchAll(pattern)].some((match) => match.slice(1).some((gap) => gap === ''));
  });
}

/**
 * The Private Use code points a font's `/ToUnicode` map sends a glyph to (#244).
 *
 * Inter maps its own alternates — the open 4, its single-storey a, the case-sensitive punctuation `calt`
 * substitutes beside a capital — into the Private Use area of its cmap, and Chrome writes whatever the
 * cmap says into the map when it embeds the subset. A reader that trusts the map, which is what a text
 * layer is for, then hands out that code point or drops it: poppler's `pdftohtml` read the name as
 * "Giovnni Trovto" and the email as "trovto.giovnni@gmil.com", while `pdftotext` on the same file read
 * both whole, because it recovers the character from the font's own cmap instead.
 *
 * So this finds the feature glyphs of a font that maps its alternates that way. One that does not would
 * leave them out of the map altogether, which is invisible here and shows only as two readers disagreeing.
 *
 * Both `bfchar` and `bfrange` are read. A range maps consecutive sources from one destination upward, so a
 * range whose destination is in the Private Use area puts every code point it spans there.
 * @param {string} cmap - One decoded `/ToUnicode` CMap
 * @returns {number[]} Every Private Use code point it maps to, in the order it maps them, without repeats
 */
export function privateUseDestinations(cmap) {
  const inPrivateUse = (code) => code >= 0xe000 && code <= 0xf8ff;
  const destination = (hex) => parseInt(hex.slice(0, 4), 16);
  const found = [];

  for (const [, block] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, , to] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      if (inPrivateUse(destination(to))) found.push(destination(to));
    }
  }
  for (const [, block] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // A range gives its destinations one of two ways: a single code point its sources count up from, or a
    // list with one entry per source. Read as three code points in a row, a list's first two entries are
    // taken for the range's ends and its third for a destination to count up from — which invented 47 code
    // points no glyph maps to, and would have failed a sound document.
    for (const [, low, high, from, list] of block.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g
    )) {
      if (list !== undefined) {
        for (const [, entry] of list.matchAll(/<([0-9A-Fa-f]+)>/g)) {
          if (inPrivateUse(destination(entry))) found.push(destination(entry));
        }
        continue;
      }
      const span = parseInt(high, 16) - parseInt(low, 16);
      for (let step = 0; step <= span; step += 1) {
        if (inPrivateUse(destination(from) + step)) found.push(destination(from) + step);
      }
    }
  }
  return [...new Set(found)];
}

/**
 * The words one reader of the text layer has and another does not (#244).
 *
 * Which word a lost glyph belonged to is what makes a Private Use finding actionable: "8 code points" says
 * nothing, "the email" says everything. Two reads of the same file are compared as bags of words, so a
 * different line wrapping between the readers does not register as a loss.
 * @param {string} reference - The text a reader that recovers every character produced
 * @param {string} other - The text the reader under test produced
 * @returns {string[]} The words the reference has that the other does not, without repeats
 */
export function wordsLostBetween(reference, other) {
  // Bare of the punctuation either side: `pdftohtml` opens a run at every weight change, so it writes
  // "Solutions" and "," where `pdftotext` writes "Solutions," — four words a naive compare called lost on
  // a document that had lost nothing, in the list that is supposed to name what went.
  const bare = (word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const words = (text) =>
    String(text ?? '')
      .split(/\s+/u)
      .map(bare)
      .filter(Boolean);
  const kept = new Set(words(other));
  return [...new Set(words(reference).filter((word) => !kept.has(word)))];
}

/**
 * Every `/ToUnicode` CMap a PDF embeds, decoded (#244).
 *
 * Read from the bytes rather than through a library, because the defect is in what the file says and a
 * library that repairs it would hide it. A stream is a CMap if it reads as one: the object graph is not
 * walked, so a map behind an object stream or a filter other than Flate is not found, and the check this
 * feeds can only ever under-report.
 * @param {Buffer} bytes - The PDF file
 * @returns {string[]} Each CMap as text
 */
export function toUnicodeCmaps(bytes) {
  const maps = [];
  for (const match of String(bytes.toString('latin1')).matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = bytes.indexOf('endstream', start, 'latin1');
    if (end < 0) continue;
    const raw = bytes.subarray(start, end);
    let text;
    try {
      text = inflateSync(raw).toString('latin1');
    } catch {
      text = raw.toString('latin1');
    }
    if (/beginbfchar|beginbfrange/.test(text)) maps.push(text);
  }
  return maps;
}

/** The text of a `pdftohtml -xml` read, which trusts the map a `pdftotext` read goes behind. */
export function xmlText(xml) {
  return String(xml ?? '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

/**
 * The fonts `pdffonts` says carry a `/ToUnicode` map, and the ones it says carry none (#238).
 *
 * What the Private Use check is worth depends on having read the maps that exist. `toUnicodeCmaps` reads
 * the bytes and can only under-report — a filter it does not know, a map it does not recognise — and an
 * audit that checked nothing must never read as a pass, which is the mistake the grayscale check made when
 * its filename pattern matched no files for weeks. So the two counts are compared, and a font with no map
 * at all is its own finding: every glyph it draws is outside any reader's reach.
 * @param {string} pdffonts - The output of `pdffonts` for one PDF
 * @returns {{ mapped: string[], unmapped: string[] }} The embedded fonts with and without a map
 */
export function toUnicodeFonts(pdffonts) {
  const embedded = pdffonts
    .split('\n')
    .slice(2)
    .map((row) => FONT_FLAGS.exec(row))
    .filter((match) => match && match[2] === 'yes');
  return {
    mapped: embedded.filter((match) => match[4] === 'yes').map((match) => match[1].trim()),
    unmapped: embedded.filter((match) => match[4] === 'no').map((match) => match[1].trim())
  };
}

/** The edge of a run of letters and digits in any script. */
const EDGE_BEFORE = `(?<!${WORD_CHARACTER})`;
const EDGE_AFTER = `(?!${WORD_CHARACTER})`;

/**
 * Every hyphenated compound the texts write, in any script, each once (#251).
 *
 * A line broken at an existing hyphen extracts without it, so "offline-first" arrives welded as "offlinefirst":
 * right on the page, unfindable by anyone searching the canonical spelling. The audit looks for that welded
 * form of each compound found here, and found here with an ASCII class, "Menü-Leiste" was never one.
 * @param {string[]} texts - Every string the profile writes
 * @returns {string[]} The compounds, in the order the texts first write them
 */
export function hyphenatedCompounds(texts) {
  const compound = new RegExp(`${WORD_CHARACTER}+-${WORD_CHARACTER}+`, 'gu');
  return [...new Set(texts.flatMap((text) => String(text ?? '').match(compound) ?? []))];
}

/**
 * The welded form of a compound, as a whole word (#251).
 *
 * Its edges are letters or digits in any script. `\b` is an ASCII boundary in JavaScript even under the `u` flag: it saw
 * no word edge before "Ü", so a welded compound that opened on one was never found, and a check built on it
 * would pass a page that had lost the hyphen.
 * @param {string} compound - A compound as `hyphenatedCompounds` found it
 * @returns {RegExp} What the text layer carries where a line broke at the compound's hyphen
 */
export function brokenCompound(compound) {
  return new RegExp(
    `${EDGE_BEFORE}${escapeForRegExp(compound.replace(/-/g, ''))}${EDGE_AFTER}`,
    'u'
  );
}

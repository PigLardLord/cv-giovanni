/**
 * Which runs of a printed page are set in a typeface the page did not ask for.
 *
 * A browser that cannot use a face in time prints the text in whatever the system substitutes, and
 * says nothing. The page still extracts, Inter is still embedded somewhere in it, and every line
 * break after the substitution has moved. `pdftohtml -xml` records the face of every run, so the
 * substitution can be named: the run, and the face it fell back to.
 *
 * This module reads that XML and nothing else — no browser, no poppler — so the rule can be shown to
 * fail on a page that breaks it.
 */

/**
 * The faces each layout sets printed text in, as a PDF names them. Checked per layout, never pooled:
 * Instrument Serif is Impact Spotlight's display face, and in Technical Profile it would mean print had
 * asked for a face that layout's screen never loads — and won a race it can also lose (#68). JetBrains
 * Mono belongs to Nerd Mode's editor, and the editor does not print.
 */
const TYPEFACES = {
  nerd: ['Inter'],
  spotlight: ['Inter', 'InstrumentSerif'],
  technical: ['Inter']
};

/**
 * The faces the cover letter prints in, from letter.html (#151): Inter, and Impact Spotlight's name in Instrument
 * Serif, as the CV sets it. Declared apart from the CV's, so a face the CV takes on is not waved through on a letter
 * that never asked for it.
 */
const LETTER_TYPEFACES = {
  nerd: ['Inter'],
  spotlight: ['Inter', 'InstrumentSerif'],
  technical: ['Inter']
};

const DOCUMENTS = { cv: TYPEFACES, letter: LETTER_TYPEFACES };

/**
 * @param {string} layout - A layout from the manifest
 * @param {'cv' | 'letter'} [document] - The printed document: the CV, or the cover letter beside it
 * @returns {string[]} The faces its printed page may use
 * @throws {Error} For a layout or a document with no faces declared: it cannot be checked, so it must not pass
 */
export function typefacesFor(layout, document = 'cv') {
  const faces = Object.hasOwn(DOCUMENTS, document) ? DOCUMENTS[document] : null;
  if (!faces || !Object.hasOwn(faces, layout)) {
    throw new Error(
      `no printed typefaces are declared for the ${document} in the layout "${layout}" in scripts/lib/printed-typefaces.mjs`
    );
  }
  return faces[layout];
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** A face's name without the subset tag the PDF embeds it under: `IAAAAA+Inter` is `Inter`. */
const untagged = (family) => family.replace(/^[A-Z]{6}\+/, '');

/**
 * The family alone: no subset tag, no style after a hyphen or a comma, letters only, lower case.
 * `IAAAAA+Inter-Bold` is `inter`, and `InterTight` stays `intertight` — a family of its own.
 */
const familyOf = (name) =>
  untagged(name)
    .replace(/[-,].*$/, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();

/** The text of a run as a reader sees it: the link and weight markup removed, entities decoded. */
const plain = (markup) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
      if (name[0] !== '#') return ENTITIES[name] ?? entity;
      const hex = name[1].toLowerCase() === 'x';
      return String.fromCodePoint(hex ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    })
    .trim();

/**
 * The runs the document sets in Bold, as `pdftohtml -xml` marks them: each `<b>` of it, as a reader sees it.
 * @param {string} xml - What `pdftohtml -xml` wrote for the printed document
 * @returns {string[]} The bold runs, in order
 */
export function boldRuns(xml) {
  return [...xml.matchAll(/<b>([\s\S]*?)<\/b>/g)]
    .map(([, markup]) => plain(markup))
    .filter(Boolean);
}

/**
 * Selected Impact lines whose figures print in no Bold run (#261): the figures of each line, by the domain's rule,
 * and whether one of them reaches the paper in Bold. A line with no figure has none to set.
 * @param {string[]} highlights - The profile's career highlights
 * @param {string[]} bold - The document's bold runs, from `boldRuns`
 * @param {(text: string) => string[]} figuresOf - The figures of a line
 * @returns {string[]} The lines whose figures print in the body's weight
 */
export function lightFigures(highlights, bold, figuresOf) {
  const bare = (text) => text.replace(/\s+/g, '');
  const printed = bold.map(bare);
  return highlights.filter((line) => {
    const figures = figuresOf(line);
    return figures.length > 0 && !figures.some((figure) => printed.includes(bare(figure)));
  });
}

/**
 * @param {string} xml - What `pdftohtml -xml` wrote for the printed document
 * @param {string[]} intended - The faces its layout prints in, from `typefacesFor`
 * @returns {{ face: string, text: string }[]} Every visible run set in another face, in order
 */
export function fallbackRuns(xml, intended) {
  const faces = new Map(
    [...xml.matchAll(/<fontspec\b[^>]*>/g)].map(([tag]) => [
      attribute(tag, 'id'),
      attribute(tag, 'family')
    ])
  );
  const wanted = intended.map(familyOf);

  return [...xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)]
    .map(([, attributes, markup]) => ({
      family: faces.get(attribute(attributes, 'font')),
      text: plain(markup)
    }))
    .filter(({ text }) => text)
    .filter(({ family }) => !family || !wanted.includes(familyOf(family)))
    .map(({ family, text }) => ({ face: family ? untagged(family) : 'undeclared', text }));
}

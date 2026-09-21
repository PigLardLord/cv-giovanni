import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeReport } from './lib/write-report.mjs';
import { boldRuns, fallbackRuns, lightFigures, typefacesFor } from './lib/printed-typefaces.mjs';
import {
  brokenCompound,
  gluedPhrases,
  hyphenatedCompounds,
  privateUseDestinations,
  toUnicodeCmaps,
  toUnicodeFonts,
  type3Fonts,
  wordsLostBetween,
  xmlText
} from './lib/extractable-text.mjs';
import { degreeBesideSchool } from './lib/degree-lines.mjs';
import { emptyFieldMarks, entrySections, printedEntries } from './lib/empty-fields.mjs';
import { imageCount, outOfOrder } from './lib/section-order.mjs';
import { builtCv, builtLetters } from './lib/printed-cv.mjs';
import { PRINTED_PAGE, bboxPages, printedRoom, roomReport } from './lib/page-room.mjs';
import { MEASURE_LIMIT, longProseLines, overflowingPeriods, proseOf } from './lib/line-length.mjs';
import {
  proseSpans,
  runtSpans,
  raggedMasthead,
  straddlingRoles,
  strandedSeparators
} from './lib/printed-prose.mjs';
import {
  addressInWindow,
  bboxLines,
  catalogueTranslator,
  letterAnchors,
  marginsClear
} from './lib/printed-letter.mjs';
import { manifestReader, resolveRun } from './lib/published-targets.mjs';
import { FIXTURES, fixturesOf, staleFixtures } from './lib/print-fixtures.mjs';
import { LetterContent } from '../core/LetterContent.js';
import { CoverLetter } from '../domain/CoverLetter.js';
import { CvDocument } from '../domain/CvDocument.js';
import { periodText } from '../domain/Tenure.js';
import { figuresIn } from '../domain/Figures.js';

/**
 * What the browser prints, checked on the paper rather than on the stylesheet.
 *
 * The CV a recruiter downloads is the page, printed by Chrome (#144), and this audit reads the
 * files `npm run build:pdf` wrote — the ones CI publishes — rather than printing a copy of its
 * own, which would pass whatever the generator wrote (#149). The printed page once hid ten
 * defects no other check could see, among them a line of text that rendered white on white
 * and a skills table that extracted as two columns with every name torn from its category.
 *
 * Nothing here reads CSS. Every check reads either the text layer poppler pulls out
 * of the PDF or the pixels the page actually put on the paper.
 *
 * A tailored profile that carries a cover letter has it printed beside each layout, from letter.html (#151), and
 * each letter is read here too, on checks of its own: a letter is one page, not a CV.
 */
const projectUrl = new URL('..', import.meta.url);
// The expectations come from the CV under test. Auditing a tailored profile against the
// published one would check strings it never contained and report a clean pass.
// One CV, or a run over every CV the manifest publishes, each re-run naming itself (#248).
const argv = process.argv.slice(2);
const run = await resolveRun('audit-print', fileURLToPath(import.meta.url), argv, {
  readManifest: manifestReader(projectUrl)
});
if ('exit' in run) process.exit(run.exit);
const { target, manifest } = run;
const profile = await readJson(target.dataPath);
const catalogue = await readJson(`locales/${target.locale}/cv.json`);
const labels = catalogue.sections;
// The prose a reader follows along a line, and each role's dates as Nerd Mode prints them, with their length (#155).
const prose = proseOf(profile);
const cv = new CvDocument(profile);
// Each role's dates as the page writes them, the period with its length (Nerd Mode's print hides the length; a run of
// the period still matches).
const periods = cv.experience.map((role) => periodText(cv, role, target.locale));
// Every bullet the roles print, and what each role says of itself, for the two measurements a reader makes of the
// page rather than of a line: how far a bullet runs, and whether a role's evidence stayed with its heading (#230).
const everyBullet = profile.relevant_experience.flatMap((role) => role.highlights ?? []);
const roleProse = profile.relevant_experience.map((role) => ({
  title: role.title,
  company: role.company,
  prose: [role.summary, role.description, ...(role.highlights ?? [])].filter(Boolean)
}));

/** Read a file the audit cannot run without. Missing means unchecked, which is exit 2. */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(new URL(path, projectUrl)));
  } catch (error) {
    console.error(`audit-print: cannot read ${path} — nothing was checked.`);
    console.error(error.message);
    process.exit(2);
  }
}
// A layout with no printed typefaces declared cannot have its text checked: exit 2, as for a file never built.
try {
  manifest.layouts.forEach((layout) => typefacesFor(layout));
  if (LetterContent.has(profile))
    manifest.layouts.forEach((layout) => typefacesFor(layout, 'letter'));
} catch (error) {
  console.error(`audit-print: ${error.message} — nothing was checked.`);
  process.exit(2);
}

const DPI = 150;
const MM = 25.4;
const CONTRAST_FLOOR = 4.5;
// What a reader skimming for six seconds takes in: a bullet of at most two printed lines, and a summary of at most
// three (#230). Both are counted on the paper, since the same words wrap differently in each layout.
const BULLET_LINES = 2;
const SUMMARY_LINES = 3;
const MARGIN_FLOOR_MM = 10;
const SIDE_TOLERANCE_MM = 1.5;

const strings = (node) =>
  typeof node === 'string'
    ? [node]
    : node && typeof node === 'object'
      ? Object.values(node).flatMap(strings)
      : [];

// The profile's summary of evidence prints under its own heading, between the contacts and the skills (#148). A
// profile without highlights prints no such section, so neither the heading nor a highlight is asked of it.
const highlights = profile.career_highlights ?? [];

const mustHave = [
  profile.name,
  profile.title,
  profile.email,
  ...highlights.slice(0, 1),
  labels.experience,
  labels.skills,
  profile.relevant_experience[0].company,
  labels.education,
  labels.languages,
  ...profile.skills[0].items.slice(0, 2).map((item) => item.name)
];

// Every hyphenated compound the data writes. A line broken at an existing hyphen
// extracts without it, so "offline-first" arrives welded shut as "offlinefirst":
// right on the page, unfindable by anyone searching the canonical spelling.
const brokenForms = hyphenatedCompounds(strings(profile)).map((compound) => ({
  compound,
  broken: brokenCompound(compound)
}));

// Every entry the page prints, with each part the profile leaves out, where a separator left in front of that part would
// print, and every word the profile writes, which is its own and not a trace: for the traces an empty field leaves in
// the text layer (#178). Each kind is looked for under its own heading, so a line elsewhere that reads like an entry's
// header is not taken for it (#213).
const entries = printedEntries(profile, { at: catalogue.experience.at });
const written = strings(profile);
const entryHeadings = entrySections(labels);

// A degree and its school must stay adjacent, with only the degree's scope between them when it states one (#48).
const educationPairs = profile.education.map((item) =>
  degreeBesideSchool(item, { credits: catalogue.education.credits, locale: target.locale })
);

/** Contrast of a grey against the white of the paper. */
function contrastOnWhite(value) {
  const channel = value / 255;
  const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 1.05 / (linear + 0.05);
}

/** Rasterise every page to greyscale and read it back as {width, height, pixels}. */
async function renderPages(path, directory) {
  execFileSync('pdftoppm', ['-gray', '-r', String(DPI), path, join(directory, 'page')]);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.pgm')).sort();
  const pages = [];
  for (const name of files) {
    const bytes = await readFile(join(directory, name));
    // P5\n<width> <height>\n255\n then one byte per pixel
    const header = bytes.subarray(0, 64).toString('latin1');
    const match = header.match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
    if (!match) continue;
    pages.push({
      width: Number(match[1]),
      height: Number(match[2]),
      pixels: bytes.subarray(match[0].length)
    });
  }
  return pages;
}

/** The rectangle of the page that carries ink, in millimetres from each edge. */
function inkMargins(page) {
  let left = page.width,
    right = -1,
    top = page.height,
    bottom = -1;
  for (let y = 0; y < page.height; y += 1) {
    const row = y * page.width;
    for (let x = 0; x < page.width; x += 1) {
      if (page.pixels[row + x] > 250) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  if (right < 0) return null;
  const mm = (pixels) => (pixels / DPI) * MM;
  return {
    left: mm(left),
    top: mm(top),
    right: mm(page.width - right),
    bottom: mm(page.height - bottom)
  };
}

/** Every word whose darkest pixel is lighter than the contrast floor allows, from `pdftotext -bbox-layout`. */
function faintWords(xml, pages) {
  const scale = DPI / 72;
  const faint = [];
  let pageIndex = -1;
  for (const chunk of xml.split('<page ')) {
    if (pageIndex >= 0 && pageIndex < pages.length) {
      const page = pages[pageIndex];
      for (const word of chunk.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g
      )) {
        const text = word[5].trim();
        if (!text) continue;
        const x0 = Math.max(0, Math.floor(Number(word[1]) * scale) - 1);
        const y0 = Math.max(0, Math.floor(Number(word[2]) * scale) - 1);
        const x1 = Math.min(page.width, Math.ceil(Number(word[3]) * scale) + 1);
        const y1 = Math.min(page.height, Math.ceil(Number(word[4]) * scale) + 1);
        let darkest = 255;
        for (let y = y0; y < y1; y += 1) {
          const row = y * page.width;
          for (let x = x0; x < x1; x += 1) {
            if (page.pixels[row + x] < darkest) darkest = page.pixels[row + x];
          }
        }
        if (contrastOnWhite(darkest) < CONTRAST_FLOOR) {
          faint.push({
            page: pageIndex + 1,
            text,
            ratio: Number(contrastOnWhite(darkest).toFixed(2))
          });
        }
      }
    }
    pageIndex += 1;
  }
  return faint;
}

/** Whether `pdfinfo` reports A4, to within a couple of points. */
function isA4(info) {
  const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
  return (
    !!size && Math.abs(Number(size[1]) - 595.28) <= 2 && Math.abs(Number(size[2]) - 841.89) <= 2
  );
}

/**
 * Everything read off one printed PDF: its text in both reading orders, the face of every run, its fonts and images,
 * and, from its pixels, the ink margins and the words too faint to read. The CV and the cover letter are measured
 * alike and scored apart.
 */
async function measure(path, faces, directory) {
  const pdf = onDisk(path);
  // The files are read as they are: a build older than an edit audits the edit's predecessor. Say when each
  // was written, where whoever runs this can see it; `npm run verify:pdf` builds first.
  const { mtime } = await stat(pdf);
  process.stderr.write(`audit-print: reading ${path}, written ${mtime.toISOString()}\n`);

  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
  // The face of every run of text, so a substitution is named rather than inferred.
  const html = execFileSync('pdftohtml', ['-xml', '-i', '-stdout', '-q', pdf], {
    encoding: 'utf8'
  });
  const fallback = fallbackRuns(html, faces);
  const bold = boldRuns(html);
  // The same file through a reader that trusts the `/ToUnicode` map, against one that goes behind it to the
  // font's own cmap. They disagree where Skia mapped a glyph Chrome reached through an OpenType feature (#244).
  const cmaps = toUnicodeCmaps(readFileSync(pdf));
  const mapping = toUnicodeFonts(execFileSync('pdffonts', [pdf], { encoding: 'utf8' }));
  const privateUse = privateUseDestinations(cmaps.join('\n'));
  // Every map `pdffonts` says exists is a map that was read, and every embedded font has one. Without
  // this the Private Use check reads green on a file whose maps it never found, and an audit that
  // checked nothing must not read as a pass.
  const unreadMaps = [
    ...mapping.unmapped.map((font) => `${font}: no /ToUnicode at all`),
    ...(cmaps.length < mapping.mapped.length
      ? [`read ${cmaps.length} of ${mapping.mapped.length} maps pdffonts reports`]
      : [])
  ];
  const lostToTheMap = wordsLostBetween(text, xmlText(html));
  // Drawing order, as PDFBox and Tika read by default, and the fonts a text extractor has to decode (#143).
  const drawn = execFileSync('pdftotext', ['-raw', pdf, '-'], { encoding: 'utf8' });
  const type3 = type3Fonts(execFileSync('pdffonts', [pdf], { encoding: 'utf8' }));
  const images = imageCount(execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' }));
  const pageCount = Number(info.match(/Pages:\s+(\d+)/)?.[1]);

  const raster = await mkdtemp(join(directory, 'raster-'));
  const pages = await renderPages(pdf, raster);
  const margins = pages.map(inkMargins).filter(Boolean);
  // Where every word and line sits on the paper: for the contrast of each word, the room left under each page's last
  // line (#162), and a letter's address in its window.
  const bbox = execFileSync('pdftotext', ['-bbox-layout', pdf, '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const faint = faintWords(bbox, pages);
  await rm(raster, { recursive: true, force: true });

  return {
    info,
    text,
    drawn,
    bbox,
    fallback,
    bold,
    type3,
    privateUse,
    unreadMaps,
    lostToTheMap,
    images,
    pageCount,
    margins,
    faint
  };
}

/** A code point as a reader of the report writes it. */
const asCodePoint = (code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

// The files the generator wrote for this profile, one per layout. One that is not there was never built, and an
// audit of it would check nothing: exit 2, as every audit here does when it did not run.
const onDisk = (path) => fileURLToPath(new URL(path, projectUrl));
const { files, missing } = builtCv(target, profile, manifest.layouts, (path) =>
  existsSync(onDisk(path))
);
// And a cover letter beside each, when the profile carries one (#151). None for the published CV.
const letters = builtLetters(target, profile, manifest.layouts, (path) => existsSync(onDisk(path)));
missing.push(...letters.missing);
if (missing.length) {
  console.error(`audit-print: ${missing.join(', ')} not built — nothing was checked.`);
  console.error('Run `npm run build:pdf` first, with the same --profile.');
  process.exit(2);
}

const workspace = await mkdtemp(join(tmpdir(), 'mycv-print-'));
const rows = [];
const letterRows = [];
// The ATS fixtures are extractions of a published CV's print, which tests read as the current one (#234). Each run of a
// published CV that has them compares them with what it extracts, so a content change that forgets them fails here,
// naming the fixture. They are found by the CV's own name, never by a path written here (#302).
const readFixture = (name) => {
  try {
    return readFileSync(new URL(`${FIXTURES}/${name}`, projectUrl), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const holdsFixtures =
  target.isPublicProfile &&
  files.some(({ layout }) =>
    fixturesOf({ profile: target.profile, locale: target.locale, layout }).some(
      ({ name }) => readFixture(name) !== null
    )
  );
const stale = [];

try {
  for (const { layout, path } of files) {
    const {
      info,
      text,
      drawn,
      bbox,
      fallback,
      bold,
      type3,
      privateUse,
      unreadMaps,
      lostToTheMap,
      images,
      pageCount,
      margins,
      faint
    } = await measure(path, typefacesFor(layout), workspace);
    if (holdsFixtures) {
      const print = { profile: target.profile, locale: target.locale, layout, text, drawn };
      stale.push(...staleFixtures(print, readFixture));
    }
    const long = longProseLines(text, prose, { periods });
    const overflow = layout === 'nerd' ? overflowingPeriods(bbox, periods) : [];
    // How close each page runs to its foot, reported and never gated: the page count is the gate (#162). A page with
    // no line has no room to measure.
    const room = bboxPages(bbox).map((page) =>
      page.lines.length ? printedRoom(page, PRINTED_PAGE) : null
    );
    const traces = emptyFieldMarks(text, { entries, written, ...entryHeadings });
    const glued = gluedPhrases(drawn, [
      profile.name,
      profile.title,
      ...profile.relevant_experience.flatMap((job) => [job.title, job.company]),
      ...profile.education.flatMap((entry) => [entry.degree, entry.school]),
      ...profile.skills.map((group) => group.category)
    ]);
    // The order a reader meets the CV in, which the text layer has to give in both reading orders (#142).
    // A section label is a heading, found only as a line of its own: a word in the body is not the section.
    const anchors = [
      profile.name,
      profile.email,
      ...(highlights.length > 0 ? [{ heading: labels.selectedImpact }] : []),
      { heading: labels.experience },
      ...profile.relevant_experience.map((job) => job.title),
      { heading: labels.skills },
      { heading: labels.education },
      ...profile.education.map((entry) => entry.degree),
      { heading: labels.languages }
    ];
    const sections = { read: outOfOrder(text, anchors), drawn: outOfOrder(drawn, anchors) };
    // What each bullet, and the summary, cost on the paper, and whether a role's own evidence left its header's page.
    const spans = proseSpans(text, everyBullet, { periods });
    const bullets = spans.filter((span) => !span.found || span.lines > BULLET_LINES);
    // And whether one ends on a line of a single word (#295).
    const runts = runtSpans(spans);
    // And whether each Selected Impact line sets its figures in Bold, where #230 put them (#261).
    const light = lightFigures(highlights, bold, figuresIn);
    const summary = proseSpans(text, [profile.profile], { periods })[0];
    const straddling = straddlingRoles(text, roleProse, { periods });
    // And whether the masthead's lines share one left edge, which a hidden label's leftover space broke.
    const firstHeading = highlights.length > 0 ? labels.selectedImpact : labels.experience;
    const ragged = raggedMasthead(bbox, { until: firstHeading });
    // And whether a line of it ends on a separator drawn for a field the profile does not state.
    const stranded = strandedSeparators(text, { until: firstHeading });
    const flat = text.replace(/\s+/g, ' ');

    const order = [profile.name, profile.title, labels.experience].map((term) =>
      text.indexOf(term)
    );
    const skillsFrom = flat.indexOf(labels.skills);
    const categories = profile.skills.map((group) => group.category);

    const checks = {
      // A4 to within a couple of points: the browser rounds the page box to whole
      // device pixels, so it prints 594.96 x 841.92 where the paper is 595.28 x 841.89.
      format: isA4(info),
      pages: pageCount > 0 && pageCount <= 2,
      // Every string a parser looks for, in the case the catalogue wrote it. A
      // section label drawn in capitals no longer matches the label itself. The
      // text is read with its line breaks flattened: a sentence set over two lines
      // is still printed, and how many lines it takes is `bulletsScan`'s question.
      content: mustHave.every((term) => flat.includes(term.replace(/\s+/g, ' ').trim())),
      readingOrder: order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1])),
      canonicalCompounds: !brokenForms.some(({ broken }) => broken.test(text)),
      blockIntegrity: educationPairs.every((pair) => pair.test(flat)),
      // Two side-by-side blocks that both wrap are read column by column: every
      // label first, then every list, and no skill reaches a parser attached to
      // the group it belongs to.
      skillsAttached: profile.skills.every((group) => {
        const at = flat.indexOf(group.category, skillsFrom);
        const first = flat.indexOf(group.items[0].name, at + 1);
        const nextCategory =
          categories
            .filter((name) => name !== group.category)
            .map((name) => flat.indexOf(name, at + 1))
            .filter((index) => index > 0)
            .sort((a, b) => a - b)[0] ?? Infinity;
        return at >= 0 && first >= 0 && first < nextCategory;
      }),
      rolesPresent: profile.relevant_experience.every(
        (job) => flat.includes(job.title) && flat.includes(job.company)
      ),
      // Ink that reaches the paper has to be readable on it. Measured per word
      // against what was actually printed, not against the declared colour.
      contrast: faint.length === 0,
      // A margin no narrower than the floor, and the two sides within a
      // millimetre and a half of each other — an asymmetry means something is
      // overflowing its column rather than sitting in it.
      margins:
        margins.length > 0 &&
        margins.every(
          (box) =>
            Math.min(box.left, box.right, box.top, box.bottom) >= MARGIN_FLOOR_MM &&
            Math.abs(box.left - box.right) <= SIDE_TOLERANCE_MM
        ),
      // Nothing in the text layer that the data did not write: no colour emoji,
      // no bare digits left behind by a CSS counter.
      textLayerClean: !/\p{Extended_Pictographic}/u.test(text) && !/^\s*\d{1,2}\s*$/m.test(text),
      // Nothing a field left empty prints instead of itself: no "()", no "undefined" or "null", no separator doubled
      // on its line, no entry ending on the separator of a part it does not have, as "Engineer at Acme," did (#169).
      // The published profile fills every field; a tailored one need not (#178).
      noEmptyFieldMarks: traces.length === 0,
      // A fallback typeface changes every line break, and with them the page
      // count and the measure. Every run has to be set in a face its layout
      // prints in: Inter embedded somewhere used to be enough, and Technical
      // Profile printed its name in Liberation Serif under a full score (#68).
      intendedTypeface: fallback.length === 0,
      // Every font a TrueType or CID font, which extractors map to text without drawing it: Chrome prints
      // a variable web font as Type 3, and several extractors have documented bugs with those.
      noType3Fonts: type3.length === 0,
      // No glyph mapped to a Private Use code point. Inter maps its own alternates there, Chrome copies the
      // cmap's code point into the `/ToUnicode` map, and a reader that trusts the map hands it out or drops
      // it: pdftohtml read the email as "trovto.giovnni@gmil.com" while pdftotext, which goes behind the map
      // to the font's cmap, read it whole — so no audit here could see it (#238).
      noPrivateUseGlyphs: privateUse.length === 0 && unreadMaps.length === 0,
      // Read in drawing order, the name, every title, employer, school and skill category keeps the
      // spaces between its words: "GiovanniTrovato" is a name no search finds.
      wordsSpacedInDrawingOrder: glued.length === 0,
      // Name, contacts, skills, every role, then education and languages, as poppler reconstructs the
      // page and as the PDF draws it: a column beside the first role put the degrees inside it.
      sectionsInOrder: sections.read.length === 0,
      sectionsInOrderDrawn: sections.drawn.length === 0,
      // No portrait (the owner's decision in #144), and no picture of anything a parser should read.
      noImages: images === 0,
      // No line of prose past WCAG 1.4.8's 80 characters. A line of skills, interests or contacts is a list, scanned
      // item by item, and is not held to the measure (#155).
      measure: long.length === 0,
      // Nerd Mode's dates stay inside their 128pt column: a longer period runs into the gap beside its role and wraps
      // nothing a text check would see.
      datesInColumn: overflow.length === 0,
      // A bullet a recruiter reads in one glance: at most two printed lines, whatever the layout (#230).
      bulletsScan: bullets.length === 0,
      // And no bullet ends on a line of one word (#295).
      bulletsEndWhole: runts.length === 0,
      // Every Selected Impact line prints a figure in Bold (#230, #261).
      impactFiguresBold: light.length === 0,
      // The summary is the first prose on the page and the last thing a skimmer gives time to: three lines.
      summaryScans: summary.found && summary.lines <= SUMMARY_LINES,
      // The page break falls between two roles. Page 2 opened on three bullets with no employer above them, which
      // is evidence a reader cannot attach to anything.
      rolesWhole: straddling.length === 0,
      // Every line of the masthead starts on the page's left edge: the name, the headline, the contact block and the
      // summary. A line 2.8pt in reads as a mistake, and a reader sees it before any check does.
      mastheadAligned: ragged.length === 0,
      // No line of the masthead opens or closes on a separator: the contacts' dots are drawn by the stylesheet, so
      // a field the profile leaves out takes its value away and would leave its dot behind (#178, #180).
      mastheadSeparatorsHeld: stranded.length === 0
    };

    const passed = Object.values(checks).filter(Boolean).length;
    rows.push({
      layout,
      pages: pageCount,
      score: `${passed}/${Object.keys(checks).length}`,
      checks,
      faint: faint.slice(0, 8),
      fallback: fallback.slice(0, 8),
      type3,
      privateUse: privateUse.map(asCodePoint),
      unreadMaps,
      lostToTheMap: lostToTheMap.slice(0, 8),
      traces,
      glued,
      sections,
      images,
      margins,
      room,
      long,
      overflow,
      bullets,
      runts,
      light,
      summary,
      straddling,
      ragged,
      stranded
    });
  }

  if (letters.files.length) {
    // The letter's words as the page wrote them, from the same catalogue, so nothing is expected that it never said.
    const { letter: words } = LetterContent.of(profile, {
      t: catalogueTranslator({ cv: catalogue }),
      locale: target.locale
    });
    const anchors = letterAnchors(words);
    const collapse = (value) => value.replace(/\s+/g, ' ').trim();
    // The three things that make it a letter rather than a page of prose.
    const wanted = [
      new CoverLetter(profile.letter).recipient.company,
      words.subject,
      words.signature
    ]
      .filter(Boolean)
      .map(collapse);

    for (const { layout, path } of letters.files) {
      const {
        info,
        text,
        drawn,
        bbox,
        fallback,
        type3,
        privateUse,
        unreadMaps,
        lostToTheMap,
        images,
        pageCount,
        margins,
        faint
      } = await measure(path, typefacesFor(layout, 'letter'), workspace);
      const parts = { read: outOfOrder(text, anchors), drawn: outOfOrder(drawn, anchors) };
      const flat = collapse(text);
      // Where each line of the address landed on the paper, as poppler places it.
      const address = addressInWindow(bboxLines(bbox), words);

      const checks = {
        format: isA4(info),
        // One page: a letter that runs onto a second is a letter nobody finishes.
        pages: pageCount === 1,
        content: wanted.every((term) => flat.includes(term)),
        // The letterhead, the address, the date, the subject, the salutation, every paragraph, the close, the
        // signature and the attachments, as poppler reconstructs the page and as the PDF draws it.
        partsInOrder: parts.read.length === 0,
        partsInOrderDrawn: parts.drawn.length === 0,
        // DIN 5008 form B: the return line at the foot of the address field's upper 17.7mm, the recipient in its
        // lower 27.3mm, 62.7 to 90mm down, and both inside a DL window envelope's window, 20 to 110mm across.
        addressInWindow: address.length === 0,
        contrast: faint.length === 0,
        // DIN 5008 form B is 24.1mm on the left and 20mm on the right by design, so the sides are not compared.
        margins: marginsClear(margins, MARGIN_FLOOR_MM),
        // No colour emoji. A letter has no counters, so a line holding only a number is a reference, not debris.
        textLayerClean: !/\p{Extended_Pictographic}/u.test(text),
        intendedTypeface: fallback.length === 0,
        noType3Fonts: type3.length === 0,
        // The letter is the other artefact this script audits, and the rule is the same: no glyph mapped
        // to a Private Use code point, because a reader that trusts the map loses it (#238).
        noPrivateUseGlyphs: privateUse.length === 0 && unreadMaps.length === 0,
        noImages: images === 0
      };

      const passed = Object.values(checks).filter(Boolean).length;
      letterRows.push({
        layout,
        pages: pageCount,
        score: `${passed}/${Object.keys(checks).length}`,
        checks,
        faint: faint.slice(0, 8),
        fallback: fallback.slice(0, 8),
        type3,
        privateUse: privateUse.map(asCodePoint),
        unreadMaps,
        lostToTheMap: lostToTheMap.slice(0, 8),
        parts,
        window: address,
        images,
        margins
      });
    }
  }
} finally {
  // What is left behind is a temporary directory of page images, not a result: say so, and let the checks stand.
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
    (error) => console.error(`audit-print: left ${workspace} behind — ${error.message}`)
  );
}

const failed = (row) => Object.values(row.checks).some((value) => !value);
const failures = rows.filter(failed);
const letterFailures = letterRows.filter(failed);
const tight = rows
  .filter((row) => roomReport(row.room).lastPageTight)
  .map((row) => `${row.layout} (${row.room[row.room.length - 1].points.toFixed(1)}pt)`);
const tightBefore = rows.flatMap((row) =>
  roomReport(row.room).tightBefore.map(
    (page) => `${row.layout} p${page} (${row.room[page - 1].points.toFixed(1)}pt)`
  )
);
// The score is `passed/Object.keys(checks).length`, so it cannot miscount; the prose describing the checks can,
// and did — 25 described under a 26/26 score (#252). So each description ends on the list the score counts,
// derived the same way, and a check added without a sentence still appears here by name.
const scoredChecks = (rowsOf) =>
  rowsOf.length ? `The checks the score counts: ${Object.keys(rowsOf[0].checks).join(', ')}.` : '';

const report = [
  '# Print quality matrix',
  '',
  'The CV `npm run build:pdf` printed from the page, measured on the artefact: the text layer',
  'poppler extracts and the pixels the page put on the paper. Regenerate with `npm run verify:pdf`.',
  '',
  `Layouts: ${rows.length}`,
  '',
  '| Layout | Pages | Score | Worst side margin | Room left |',
  '|---|---:|---:|---:|---|',
  ...rows.map((row) => {
    const worst = row.margins.length
      ? Math.min(...row.margins.flatMap((box) => [box.left, box.right])).toFixed(1)
      : '—';
    return `| ${row.layout} | ${row.pages} | ${row.score} | ${worst}mm | ${roomReport(row.room).column} |`;
  }),
  '',
  `Room left is the space between each page's lowest line and its ${PRINTED_PAGE.bottomMargin}pt bottom margin. A page`,
  `with less than one ${PRINTED_PAGE.bodyLine.toFixed(1)}pt line of running text free is marked ⚠: on the last page the`,
  'next line has nowhere to go; on a page before it, the next line moves the block at its foot — today a role —',
  'whole to the next page. It is a warning, never a failure, since the page count is the gate.',
  ...(tight.length ? ['', `⚠ Tight last page: ${tight.join(', ')}.`] : []),
  ...(tightBefore.length
    ? [
        '',
        `⚠ Tight page before the last: ${tightBefore.join(', ')} — the next line added moves the block at its foot to the next page.`
      ]
    : []),
  ...(holdsFixtures
    ? [
        '',
        stale.length
          ? `✗ Stale ATS fixtures, extracted from an older print: ${stale.map(({ fixture }) => fixture).join(', ')}.`
          : `The ATS fixtures in \`${FIXTURES}/\` are this print, word for word and line for line as \`pdftotext\` and \`pdftotext -raw\` extract it, allowing for the spaces poppler infers.`
      ]
    : []),
  '',
  'Checks: A4, at most two pages, required ATS text in the case the catalogue wrote it,',
  'reading order, canonical hyphenated compounds, degree beside its school, every skill',
  'attached to its category, every role present, every word at 4.5:1 on paper, margins',
  `no narrower than ${MARGIN_FLOOR_MM}mm and symmetric within ${SIDE_TOLERANCE_MM}mm, a text layer carrying nothing`,
  'the data did not write and no trace of a field left empty (no `()`, no `undefined` or `null`, no',
  'separator doubled on its line, no entry ending on the separator of a part it does not have),',
  'every run of text set in a typeface its layout prints in, no Type 3 font, no glyph mapped to a Private',
  'Use code point,',
  'and, read in drawing order as PDFBox and Tika read, the name, titles, employers, schools and',
  'skill categories with the spaces between their words, the sections in reading order both as',
  'poppler reconstructs the page and as the PDF draws it, no image, no line of prose past',
  `${MEASURE_LIMIT} characters (WCAG 1.4.8; lists of skills, interests and contacts are scanned, not read along a`,
  "measure, and are exempt), in Nerd Mode every line of a role's dates inside its column, every bullet set over no",
  `more than ${BULLET_LINES} printed lines and none ending on a line of one word, a figure of every Selected Impact line in Bold, the summary over no more than ${SUMMARY_LINES}, and every role whole on one page, so no`,
  'page opens on a bullet whose role heading stands on the page before, and every line of the masthead on the',
  "page's left edge, none of them opening or closing on a separator.",
  '',
  scoredChecks(rows),
  // Only a profile that carries a letter has one to report, so the published report reads as it always has.
  ...(letterRows.length
    ? [
        '',
        '## Cover letters',
        '',
        'The letter `npm run build:pdf` printed from `letter.html` beside each layout, measured the same way.',
        '',
        '| Layout | Pages | Score | Left margin |',
        '|---|---:|---:|---:|',
        ...letterRows.map((row) => {
          const left = row.margins.length
            ? Math.min(...row.margins.map((box) => box.left)).toFixed(1)
            : '—';
          return `| ${row.layout} | ${row.pages} | ${row.score} | ${left}mm |`;
        }),
        '',
        "Checks: A4, one page, the recipient's company, the subject and the signature, the letter's parts",
        'in reading order both as poppler reconstructs the page and as the PDF draws it, the return line',
        "within 45–62.7mm of the top edge and every line of the recipient's address within 62.7–90mm, both",
        "inside a DL window envelope's window 20–110mm across (DIN 5008 form B), every word at 4.5:1",
        `on paper, every margin no narrower than ${MARGIN_FLOOR_MM}mm (form B is asymmetric by design, so the sides`,
        'are not compared), no pictograph in the text layer, every run of text set in a typeface its layout',
        'prints in, no Type 3 font, no glyph mapped to a Private Use code point, and no image.',
        '',
        scoredChecks(letterRows)
      ]
    : [])
].join('\n');

await writeReport(new URL(target.reportPath('PRINT_AUDIT.md'), projectUrl), `${report}\n`);
console.log(report);

const failedChecks = (checks) =>
  Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([name]) => name);
if (stale.length) {
  console.error('');
  console.error(
    'audit-print: the ATS fixtures are not this print. Extract them again from this build — `pdftotext` and ' +
      '`pdftotext -raw` of each layout into tests/fixtures/ats/page-print-<profile>-<locale>-<layout>.txt and ' +
      '.raw.txt — and check what the tests they feed now say. On ' +
      "CI, the run's audit-reports artefact holds the PDFs it printed, under printed/."
  );
  for (const { fixture, line, printed, fixed } of stale) {
    console.error(
      `  ${fixture}, line ${line}: printed ${JSON.stringify(printed)}, fixture ${JSON.stringify(fixed)}`
    );
  }
  process.exitCode = 1;
}
if (failures.length || letterFailures.length) {
  console.error('');
  console.error(
    JSON.stringify(
      [
        ...failures.map(
          ({
            layout,
            checks,
            faint,
            fallback,
            type3,
            privateUse,
            unreadMaps,
            lostToTheMap,
            traces,
            glued,
            sections,
            images,
            long,
            overflow,
            bullets,
            runts,
            light,
            summary,
            straddling,
            ragged,
            stranded
          }) => ({
            layout,
            failed: failedChecks(checks),
            faint,
            fallback,
            type3,
            privateUse,
            unreadMaps,
            lostToTheMap,
            traces,
            glued,
            sections,
            images,
            long,
            overflow,
            bullets,
            runts,
            light,
            summary,
            straddling,
            ragged,
            stranded
          })
        ),
        ...letterFailures.map(
          ({ layout, checks, faint, fallback, type3, parts, window, images, margins }) => ({
            letter: layout,
            failed: failedChecks(checks),
            faint,
            fallback,
            type3,
            parts,
            window,
            images,
            margins
          })
        )
      ],
      null,
      2
    )
  );
  process.exitCode = 1;
}

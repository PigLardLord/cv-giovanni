import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeReport } from './lib/write-report.mjs';
import { fallbackRuns, typefacesFor } from './lib/printed-typefaces.mjs';
import { gluedPhrases, type3Fonts } from './lib/extractable-text.mjs';
import { imageCount, outOfOrder } from './lib/section-order.mjs';
import { builtCv } from './lib/printed-cv.mjs';
import { PRINTED_PAGE, bboxPages, printedRoom, roomReport } from './lib/page-room.mjs';
import { GenerationTarget } from '../core/GenerationTarget.js';

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
 */
const projectUrl = new URL('..', import.meta.url);
// The expectations come from the CV under test. Auditing a tailored profile against the
// published one would check strings it never contained and report a clean pass.
const target = GenerationTarget.fromArguments(process.argv.slice(2));
const profile = await readJson(target.dataPath);
const labels = (await readJson(`locales/${target.locale}/cv.json`)).sections;

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
const manifest = JSON.parse(await readFile(new URL('config/cv-manifest.json', projectUrl)));
// A layout with no printed typefaces declared cannot have its text checked: exit 2, as for a file never built.
try {
  manifest.layouts.forEach(typefacesFor);
} catch (error) {
  console.error(`audit-print: ${error.message} — nothing was checked.`);
  process.exit(2);
}

const DPI = 150;
const MM = 25.4;
const CONTRAST_FLOOR = 4.5;
const MARGIN_FLOOR_MM = 10;
const SIDE_TOLERANCE_MM = 1.5;

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
const brokenForms = [
  ...new Set(strings(profile).flatMap((text) => text.match(/[A-Za-z0-9]+-[A-Za-z0-9]+/g) || []))
].map((compound) => ({
  compound,
  broken: new RegExp(`\\b${escapeForRegExp(compound.replace(/-/g, ''))}\\b`)
}));

// A degree and its school must stay adjacent. The web renderer writes
// "<school> (<period>)" where the PDF writes "<school> · <period>".
const educationPairs = profile.education.map(
  (item) =>
    new RegExp(
      `${escapeForRegExp(item.degree)}\\s+${escapeForRegExp(item.school)}\\s*[·(]\\s*${escapeForRegExp(item.period)}`
    )
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

/** Every word whose darkest pixel is lighter than the contrast floor allows. */
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

// The files the generator wrote for this profile, one per layout. One that is not there was never built, and an
// audit of it would check nothing: exit 2, as every audit here does when it did not run.
const onDisk = (path) => fileURLToPath(new URL(path, projectUrl));
const { files, missing } = builtCv(target, profile, manifest.layouts, (path) =>
  existsSync(onDisk(path))
);
if (missing.length) {
  console.error(`audit-print: ${missing.join(', ')} not built — nothing was checked.`);
  console.error('Run `npm run build:pdf` first, with the same --profile.');
  process.exit(2);
}

const workspace = await mkdtemp(join(tmpdir(), 'mycv-print-'));
const rows = [];

try {
  for (const { layout, path } of files) {
    const pdf = onDisk(path);
    // The files are read as they are: a build older than an edit audits the edit's predecessor. Say when each
    // was written, where whoever runs this can see it; `npm run verify:pdf` builds first.
    const { mtime } = await stat(pdf);
    process.stderr.write(`audit-print: reading ${path}, written ${mtime.toISOString()}\n`);

    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
    // The face of every run of text, so a substitution is named rather than inferred.
    const fallback = fallbackRuns(
      execFileSync('pdftohtml', ['-xml', '-i', '-stdout', '-q', pdf], { encoding: 'utf8' }),
      typefacesFor(layout)
    );
    // Drawing order, as PDFBox and Tika read by default, and the fonts a text extractor has to decode (#143).
    const drawn = execFileSync('pdftotext', ['-raw', pdf, '-'], { encoding: 'utf8' });
    const type3 = type3Fonts(execFileSync('pdffonts', [pdf], { encoding: 'utf8' }));
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
      { heading: labels.skills },
      { heading: labels.experience },
      ...profile.relevant_experience.map((job) => job.title),
      { heading: labels.education },
      ...profile.education.map((entry) => entry.degree),
      { heading: labels.languages }
    ];
    const sections = { read: outOfOrder(text, anchors), drawn: outOfOrder(drawn, anchors) };
    const images = imageCount(execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' }));
    const flat = text.replace(/\s+/g, ' ');
    const pageCount = Number(info.match(/Pages:\s+(\d+)/)?.[1]);

    const raster = await mkdtemp(join(workspace, 'raster-'));
    const pages = await renderPages(pdf, raster);
    const margins = pages.map(inkMargins).filter(Boolean);
    const bbox = execFileSync('pdftotext', ['-bbox-layout', pdf, '-'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
    const faint = faintWords(bbox, pages);
    // How close each page runs to its foot, reported and never gated: the page count is the gate (#162). A page with
    // no line has no room to measure.
    const room = bboxPages(bbox).map((page) =>
      page.lines.length ? printedRoom(page, PRINTED_PAGE) : null
    );
    await rm(raster, { recursive: true, force: true });

    const order = [profile.name, profile.title, labels.experience].map((term) =>
      text.indexOf(term)
    );
    const skillsFrom = flat.indexOf(labels.skills);
    const categories = profile.skills.map((group) => group.category);

    const checks = {
      // A4 to within a couple of points: the browser rounds the page box to whole
      // device pixels, so it prints 594.96 x 841.92 where the paper is 595.28 x 841.89.
      format: (() => {
        const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
        return (
          !!size &&
          Math.abs(Number(size[1]) - 595.28) <= 2 &&
          Math.abs(Number(size[2]) - 841.89) <= 2
        );
      })(),
      pages: pageCount > 0 && pageCount <= 2,
      // Every string a parser looks for, in the case the catalogue wrote it. A
      // section label drawn in capitals no longer matches the label itself.
      content: mustHave.every((term) => text.includes(term)),
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
      // A fallback typeface changes every line break, and with them the page
      // count and the measure. Every run has to be set in a face its layout
      // prints in: Inter embedded somewhere used to be enough, and Technical
      // Profile printed its name in Liberation Serif under a full score (#68).
      intendedTypeface: fallback.length === 0,
      // Every font a TrueType or CID font, which extractors map to text without drawing it: Chrome prints
      // a variable web font as Type 3, and several extractors have documented bugs with those.
      noType3Fonts: type3.length === 0,
      // Read in drawing order, the name, every title, employer, school and skill category keeps the
      // spaces between its words: "GiovanniTrovato" is a name no search finds.
      wordsSpacedInDrawingOrder: glued.length === 0,
      // Name, contacts, skills, every role, then education and languages, as poppler reconstructs the
      // page and as the PDF draws it: a column beside the first role put the degrees inside it.
      sectionsInOrder: sections.read.length === 0,
      sectionsInOrderDrawn: sections.drawn.length === 0,
      // No portrait (the owner's decision in #144), and no picture of anything a parser should read.
      noImages: images === 0
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
      glued,
      sections,
      images,
      margins,
      room
    });
  }
} finally {
  // What is left behind is a temporary directory of page images, not a result: say so, and let the checks stand.
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
    (error) => console.error(`audit-print: left ${workspace} behind — ${error.message}`)
  );
}

const failures = rows.filter((row) => Object.values(row.checks).some((value) => !value));
const tight = rows
  .filter((row) => roomReport(row.room).lastPageTight)
  .map((row) => `${row.layout} (${row.room[row.room.length - 1].points.toFixed(1)}pt)`);
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
  `Room left is the space between each page's lowest line and its ${PRINTED_PAGE.bottomMargin}pt bottom margin. A last`,
  `page with less than one ${PRINTED_PAGE.bodyLine.toFixed(1)}pt line of running text free is marked ⚠: the next line`,
  'added to it has nowhere to go. It is a warning, never a failure, since the page count is the gate.',
  ...(tight.length ? ['', `⚠ Tight last page: ${tight.join(', ')}.`] : []),
  '',
  'Checks: A4, at most two pages, required ATS text in the case the catalogue wrote it,',
  'reading order, canonical hyphenated compounds, degree beside its school, every skill',
  'attached to its category, every role present, every word at 4.5:1 on paper, margins',
  `no narrower than ${MARGIN_FLOOR_MM}mm and symmetric within ${SIDE_TOLERANCE_MM}mm, a text layer carrying nothing`,
  'the data did not write, every run of text set in a typeface its layout prints in, no Type 3 font,',
  'and, read in drawing order as PDFBox and Tika read, the name, titles, employers, schools and',
  'skill categories with the spaces between their words, the sections in reading order both as',
  'poppler reconstructs the page and as the PDF draws it, and no image.'
].join('\n');

await writeReport(new URL(target.reportPath('PRINT_AUDIT.md'), projectUrl), `${report}\n`);
console.log(report);

if (failures.length) {
  console.error('');
  console.error(
    JSON.stringify(
      failures.map(({ layout, checks, faint, fallback, type3, glued, sections, images }) => ({
        layout,
        failed: Object.entries(checks)
          .filter(([, value]) => !value)
          .map(([name]) => name),
        faint,
        fallback,
        type3,
        glued,
        sections,
        images
      })),
      null,
      2
    )
  );
  process.exitCode = 1;
}

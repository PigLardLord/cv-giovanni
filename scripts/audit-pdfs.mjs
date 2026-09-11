import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenerationTarget } from '../core/GenerationTarget.js';
import { readableAddress } from '../domain/ReadableUrl.js';
import { CoverLetter } from '../domain/CoverLetter.js';

const projectRoot = new URL('../', import.meta.url);
// The expectations come from the CV under test, not from the published one. Auditing a
// tailored profile against `general` would check strings it never contained and pass.
const target = GenerationTarget.fromArguments(process.argv.slice(2));
const qaUrl = new URL(`${target.qaDir}/`, projectRoot);
const profile = await readJson(target.dataPath);
const cvMessages = await readJson(`locales/${target.locale}/cv.json`);

/** Read a file the audit cannot run without. Missing means unchecked, which is exit 2. */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(new URL(path, projectRoot)));
  } catch (error) {
    console.error(`audit-pdfs: cannot read ${path} — nothing was checked.`);
    console.error(error.message);
    process.exit(2);
  }
}
const labels = cvMessages.sections;
// The current employer and the first two skills come from the data rather than from a
// literal: a tailored profile is a different CV, and an audit that checks another CV's
// strings is checking nothing about this one.
const mustHave = [
  profile.name,
  profile.title,
  profile.email,
  labels.experience,
  labels.skills,
  profile.relevant_experience[0].company,
  labels.education,
  labels.languages,
  ...profile.skills[0].items.slice(0, 2).map((item) => item.name)
];
// Every address the CV claims, in the form a reader would retype.
const addresses = [...(profile.social || []).map((item) => item.url), profile.portfolio]
  .filter(Boolean)
  .map((url) => readableAddress(url))
  .filter(Boolean);
const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const strings = (node) =>
  typeof node === 'string'
    ? [node]
    : node && typeof node === 'object'
      ? Object.values(node).flatMap(strings)
      : [];
// Every hyphenated compound the data writes. pdfmake breaks a line at an existing hyphen and
// plain extraction rejoins the halves without it, so `Objective-C` arrives as `ObjectiveC` —
// invisible on the page, and unfindable by anyone searching the canonical spelling.
const compounds = [
  ...new Set(strings(profile).flatMap((text) => text.match(/[A-Za-z0-9]+-[A-Za-z0-9]+/g) || []))
];
const brokenForms = compounds.map((compound) => ({
  compound,
  broken: new RegExp(`\\b${escapeForRegExp(compound.replace(/-/g, ''))}\\b`)
}));
// A degree and its institution must stay adjacent: when two sections share a horizontal band a
// parser interleaves them, and the record boundaries a structured reader looks for are destroyed.
const educationPairs = profile.education.map(
  (item) =>
    new RegExp(
      `${escapeForRegExp(item.degree)}\\s+${escapeForRegExp(`${item.school} · ${item.period}`)}`
    )
);
const pdfFiles = (await readdir(qaUrl).catch(() => []))
  .filter((name) => name.endsWith('.pdf'))
  .sort();
// An empty matrix used to score a clean pass. Nothing to check is not the same as nothing
// wrong — the grayscale check spent weeks matching no files and reporting a guarantee.
if (!pdfFiles.length) {
  console.error(`audit-pdfs: no PDFs under ${target.qaDir} — nothing was checked.`);
  console.error('Run `npm run build:pdf` first, with the same --profile.');
  process.exit(2);
}
const rows = [];
const validPageStarts = [
  labels.skills,
  labels.experience,
  labels.education,
  labels.languages,
  labels.certifications,
  labels.selectedImpact,
  ...profile.skills.map((group) => group.category),
  ...profile.relevant_experience.map((job) => job.title),
  ...profile.education.map((item) => item.degree),
  ...profile.certifications.map((item) => item.name),
  // A role may continue onto page two, but never mid-sentence: each achievement is a complete
  // sentence, so opening on one satisfies the rule. What stays forbidden is a page that begins
  // partway through a line, and a role severed from its FIRST achievement — which the renderer
  // prevents by keeping the head and that first line together.
  ...profile.relevant_experience.flatMap((job) => job.highlights || [])
];

/** True when EVERY page is free of colour. Page one alone is not the document. */
async function isGrayscale(path) {
  const directory = await mkdtemp(join(tmpdir(), 'mycv-mono-'));
  const prefix = join(directory, 'page');
  execFileSync('pdftoppm', ['-r', '24', path, prefix]);
  const pages = (await readdir(directory)).filter((name) => name.endsWith('.ppm')).sort();
  if (!pages.length) return false;
  let grayscale = true;
  for (const page of pages) {
    const ppmPath = join(directory, page);
    const bytes = await readFile(ppmPath);
    const marker = Buffer.from('\n255\n');
    const headerEnd = bytes.indexOf(marker) + marker.length;
    if (headerEnd < marker.length) grayscale = false;
    for (let index = headerEnd; grayscale && index + 2 < bytes.length; index += 3) {
      grayscale = bytes[index] === bytes[index + 1] && bytes[index + 1] === bytes[index + 2];
    }
    await unlink(ppmPath);
  }
  return grayscale;
}

/** Every skill category still carrying its own list, in extraction rather than on the page. */
function skillsAttached(collapsed) {
  const from = collapsed.indexOf(labels.skills);
  const categories = profile.skills.map((group) => group.category);
  return profile.skills.every((group) => {
    const at = collapsed.indexOf(group.category, from);
    const first = collapsed.indexOf(group.items[0].name, at + group.category.length);
    const nextCategory =
      categories
        .filter((name) => name !== group.category)
        .map((name) => collapsed.indexOf(name, at + group.category.length))
        .filter((index) => index > 0)
        .sort((a, b) => a - b)[0] ?? Infinity;
    return at >= 0 && first >= 0 && first < nextCategory;
  });
}

/** Each highlight whole, and in the order the data wrote them. Columned, they interleave. */
function highlightsIntact(collapsed) {
  let cursor = -1;
  return (profile.career_highlights || []).every((highlight) => {
    const at = collapsed.indexOf(highlight.replace(/\s+/g, ' '), cursor + 1);
    if (at < 0) return false;
    cursor = at;
    return true;
  });
}

// A cover letter is a different document and has to be asked different questions: it has no
// chronology, no skills and no second page, so every structural check written for a CV would
// fail on a perfectly good one. The `-letter` in the name is the signal, which is why
// LetterExporter puts it there.
const isCoverLetter = (filename) => /-cover(-|\.)/.test(filename);
const letter = profile.letter ? new CoverLetter(profile.letter) : null;

for (const filename of pdfFiles) {
  const path = new URL(filename, qaUrl).pathname;
  const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
  const extracted = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
  const imageList = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' });
  const expectedLetter = filename.includes('-letter-');
  const sizeOk = expectedLetter ? /612 x 792 pts/.test(info) : /595\.28 x 841\.89 pts/.test(info);
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
  const pageTwo =
    pages > 1
      ? execFileSync('pdftotext', ['-f', '2', '-l', '2', path, '-'], { encoding: 'utf8' })
      : '';
  const pageTwoStart =
    pageTwo
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '';
  const collapsed = extracted.replace(/\s+/g, ' ');
  // The suffix is '-monochrome.pdf': matching '-monochrome-' matched nothing, so the
  // grayscale check never ran and every variant reported a guarantee nobody verified.
  const isMonochrome = filename.includes('-monochrome');
  const order = [profile.name, profile.title, labels.experience].map((term) =>
    extracted.indexOf(term)
  );
  const checks = isCoverLetter(filename)
    ? {
        format: sizeOk,
        // One page. A cover letter that runs onto a second is a letter nobody finishes.
        pages: pages === 1,
        // The three things that make it a letter rather than a page of prose. A letter whose
        // company name does not extract is addressed to nobody.
        content: [letter?.recipient.company, letter?.subject, letter?.signature]
          .filter(Boolean)
          .every((term) => extracted.includes(term)),
        textOnly: imageList.trim().split('\n').length <= 2,
        monochromeMode: !isMonochrome || (await isGrayscale(path)),
        canonicalCompounds: !brokenForms.some(({ broken }) => broken.test(extracted))
      }
    : {
        format: sizeOk,
        pages: pages > 0 && pages <= 2,
        content: mustHave.every((term) => extracted.includes(term)),
        readingOrder: order.every(
          (position, index) => position >= 0 && (index === 0 || position > order[index - 1])
        ),
        textOnly: imageList.trim().split('\n').length <= 2,
        // Either direction: a whitelisted entry may be a whole sentence while the extracted line is
        // only its first wrapped fragment. Comparing one way declared a clean start dirty.
        cleanPageStart:
          pages < 2 ||
          validPageStarts.some(
            (start) => pageTwoStart.startsWith(start) || start.startsWith(pageTwoStart)
          ),
        monochromeMode: !isMonochrome || (await isGrayscale(path)),
        canonicalCompounds: !brokenForms.some(({ broken }) => broken.test(extracted)),
        blockIntegrity:
          educationPairs.every((pair) => pair.test(collapsed)) &&
          (!extracted.includes(labels.selectedImpact) || highlightsIntact(collapsed)),
        // A category beside its list is two columns, and two columns that both wrap interleave.
        // `Architecture & practices` used to arrive as `Architecture &` … list … `practices`,
        // so a parser recovered two categories and a list attached to neither. The check is that
        // each category's first skill follows its own label and precedes any other label.
        skillsAttached: skillsAttached(collapsed),
        // A PDF link annotation carries the URL; the text layer carries only what was drawn. A
        // document that draws "GitHub" over a hyperlink hands a parser no address at all, and
        // hands a reader holding the printed page nothing to type. Each address must also survive
        // whole: broken across a line it extracts welded, which is a different wrong address.
        addressesRecoverable: addresses.every((address) => collapsed.includes(address))
      };
  const passed = Object.values(checks).filter(Boolean).length;
  rows.push({ filename, pages, score: `${passed}/${Object.keys(checks).length}`, checks });
}

const failures = rows.filter((row) => Object.values(row.checks).some((value) => !value));
const report = [
  '# PDF quality matrix',
  '',
  `Generated variants: ${rows.length}`,
  '',
  '| File | Pages | Score |',
  '|---|---:|---:|',
  ...rows.map((row) => `| ${row.filename} | ${row.pages} | ${row.score} |`),
  '',
  'Checks: exact format, maximum two pages, required ATS text, reading order, no raster images, clean page starts, measured grayscale output, canonical compound spelling, block integrity in extraction, every skill category still attached to its own list, and every web address recoverable from the text layer.'
].join('\n');

await writeFile(new URL(target.reportPath('PDF_AUDIT.md'), projectRoot), `${report}\n`);
console.log(report);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}

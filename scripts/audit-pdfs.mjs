import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const qaUrl = new URL('../generated/qa/', import.meta.url);
const profile = JSON.parse(await readFile(new URL('../profiles/general/en.json', import.meta.url)));
const cvMessages = JSON.parse(await readFile(new URL('../locales/en/cv.json', import.meta.url)));
const labels = cvMessages.sections;
const mustHave = [profile.name, profile.title, profile.email, labels.experience, labels.skills, 'Cortado Mobile Solutions', 'Swift', 'CI/CD', labels.education, labels.languages];
const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const strings = (node) => typeof node === 'string' ? [node]
  : node && typeof node === 'object' ? Object.values(node).flatMap(strings) : [];
// Every hyphenated compound the data writes. pdfmake breaks a line at an existing hyphen and
// plain extraction rejoins the halves without it, so `Objective-C` arrives as `ObjectiveC` —
// invisible on the page, and unfindable by anyone searching the canonical spelling.
const compounds = [...new Set(strings(profile).flatMap((text) =>
  text.match(/[A-Za-z0-9]+-[A-Za-z0-9]+/g) || []))];
const brokenForms = compounds.map((compound) => ({
  compound, broken: new RegExp(`\\b${escapeForRegExp(compound.replace(/-/g, ''))}\\b`)
}));
// A degree and its institution must stay adjacent: when two sections share a horizontal band a
// parser interleaves them, and the record boundaries a structured reader looks for are destroyed.
const educationPairs = profile.education.map((item) =>
  new RegExp(`${escapeForRegExp(item.degree)}\\s+${escapeForRegExp(`${item.school} · ${item.period}`)}`));
const pdfFiles = (await readdir(qaUrl)).filter((name) => name.endsWith('.pdf')).sort();
const rows = [];
const validPageStarts = [
  labels.skills, labels.experience, labels.education, labels.languages, labels.certifications, labels.selectedImpact,
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

for (const filename of pdfFiles) {
  const path = new URL(filename, qaUrl).pathname;
  const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
  const extracted = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
  const imageList = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' });
  const expectedLetter = filename.includes('-letter-');
  const sizeOk = expectedLetter ? /612 x 792 pts/.test(info) : /595\.28 x 841\.89 pts/.test(info);
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
  const pageTwo = pages > 1 ? execFileSync('pdftotext', ['-f', '2', '-l', '2', path, '-'], { encoding: 'utf8' }) : '';
  const pageTwoStart = pageTwo.split('\n').map((line) => line.trim()).find(Boolean) || '';
  const collapsed = extracted.replace(/\s+/g, ' ');
  // The suffix is '-monochrome.pdf': matching '-monochrome-' matched nothing, so the
  // grayscale check never ran and every variant reported a guarantee nobody verified.
  const isMonochrome = filename.includes('-monochrome');
  const order = [profile.name, profile.title, labels.experience].map((term) => extracted.indexOf(term));
  const checks = {
    format: sizeOk,
    pages: pages > 0 && pages <= 2,
    content: mustHave.every((term) => extracted.includes(term)),
    readingOrder: order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1])),
    textOnly: imageList.trim().split('\n').length <= 2,
    // Either direction: a whitelisted entry may be a whole sentence while the extracted line is
    // only its first wrapped fragment. Comparing one way declared a clean start dirty.
    cleanPageStart: pages < 2 || validPageStarts.some((start) =>
      pageTwoStart.startsWith(start) || start.startsWith(pageTwoStart)),
    monochromeMode: !isMonochrome || await isGrayscale(path),
    canonicalCompounds: !brokenForms.some(({ broken }) => broken.test(extracted)),
    blockIntegrity: educationPairs.every((pair) => pair.test(collapsed))
      && (!extracted.includes(labels.selectedImpact) || highlightsIntact(collapsed))
  };
  const passed = Object.values(checks).filter(Boolean).length;
  rows.push({ filename, pages, score: `${passed}/${Object.keys(checks).length}`, checks });
}

const failures = rows.filter((row) => Object.values(row.checks).some((value) => !value));
const report = [
  '# PDF quality matrix', '', `Generated variants: ${rows.length}`, '',
  '| File | Pages | Score |', '|---|---:|---:|',
  ...rows.map((row) => `| ${row.filename} | ${row.pages} | ${row.score} |`), '',
  'Checks: exact format, maximum two pages, required ATS text, reading order, no raster images, clean page starts, measured grayscale output, canonical compound spelling, and block integrity in extraction.'
].join('\n');

await writeFile(new URL('../docs/PDF_AUDIT.md', import.meta.url), `${report}\n`);
console.log(report);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}

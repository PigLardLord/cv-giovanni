import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const qaUrl = new URL('../generated/qa/', import.meta.url);
const profile = JSON.parse(await readFile(new URL('../profiles/general/en.json', import.meta.url)));
const cvMessages = JSON.parse(await readFile(new URL('../locales/en/cv.json', import.meta.url)));
const labels = cvMessages.sections;
const mustHave = [profile.name, profile.title, profile.email, labels.experience, labels.skills, 'Cortado Mobile Solutions', 'Swift', 'CI/CD', labels.education, labels.languages];
const pdfFiles = (await readdir(qaUrl)).filter((name) => name.endsWith('.pdf')).sort();
const rows = [];
const validPageStarts = [
  labels.skills, labels.experience, labels.education, labels.languages, labels.certifications, labels.selectedImpact,
  ...profile.skills.map((group) => group.category),
  ...profile.relevant_experience.map((job) => job.title),
  ...profile.education.map((item) => item.degree),
  ...profile.certifications.map((item) => item.name)
];

async function isGrayscale(path) {
  const directory = await mkdtemp(join(tmpdir(), 'mycv-mono-'));
  const prefix = join(directory, 'page');
  execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-r', '24', '-singlefile', path, prefix]);
  const ppmPath = `${prefix}.ppm`;
  const bytes = await readFile(ppmPath);
  const marker = Buffer.from('\n255\n');
  const headerEnd = bytes.indexOf(marker) + marker.length;
  let grayscale = headerEnd >= marker.length;
  for (let index = headerEnd; grayscale && index + 2 < bytes.length; index += 3) {
    grayscale = bytes[index] === bytes[index + 1] && bytes[index + 1] === bytes[index + 2];
  }
  await unlink(ppmPath);
  return grayscale;
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
  const isMonochrome = filename.includes('-monochrome-');
  const order = [profile.name, profile.title, labels.experience].map((term) => extracted.indexOf(term));
  const checks = {
    format: sizeOk,
    pages: pages > 0 && pages <= 2,
    content: mustHave.every((term) => extracted.includes(term)),
    readingOrder: order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1])),
    textOnly: imageList.trim().split('\n').length <= 2,
    cleanPageStart: pages < 2 || validPageStarts.some((start) => pageTwoStart.startsWith(start)),
    monochromeMode: !isMonochrome || await isGrayscale(path)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  rows.push({ filename, pages, score: `${passed}/${Object.keys(checks).length}`, checks });
}

const failures = rows.filter((row) => Object.values(row.checks).some((value) => !value));
const report = [
  '# PDF quality matrix', '', `Generated variants: ${rows.length}`, '',
  '| File | Pages | Score |', '|---|---:|---:|',
  ...rows.map((row) => `| ${row.filename} | ${row.pages} | ${row.score} |`), '',
  'Checks: exact format, maximum two pages, required ATS text, reading order, no raster images, clean page starts, and measured grayscale output.'
].join('\n');

await writeFile(new URL('../docs/PDF_AUDIT.md', import.meta.url), `${report}\n`);
console.log(report);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}

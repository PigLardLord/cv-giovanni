import { readFile, writeFile } from 'node:fs/promises';
import { NodeDirectoryWriter } from '../adapters/NodeDirectoryWriter.js';
import { GenerationTarget } from '../core/GenerationTarget.js';
import { CvDocument } from '../domain/CvDocument.js';
import { countedPast } from '../domain/Tenure.js';
import { findBrowser } from './lib/find-browser.mjs';
import {
  builtCv,
  builtLetters,
  printLayouts,
  printLetters,
  withServedPage
} from './lib/printed-cv.mjs';

/**
 * Writes the CV a recruiter downloads: the page, printed by Chrome in each layout (#144, #149). And, for a
 * tailored profile that carries one, the cover letter beside each layout's CV, printed from letter.html (#151).
 *
 * One CV and one design. pdfmake composed a second one from the model, in a layout of its own, and the page
 * and the PDF drifted apart. The PDF is now the page's print stylesheet on A4, the letter its own page's, and
 * `npm run audit:print` and `npm run audit:ats` read the files written here.
 */
const projectRoot = new URL('../', import.meta.url);
const target = GenerationTarget.fromArguments(process.argv.slice(2));
const { layouts } = JSON.parse(await readFile(new URL('config/cv-manifest.json', projectRoot)));
// Lengths are counted to the profile's asOf, and the CV says so (#55). Today is only the limit: a month after
// it gives lengths nobody can check yet.
const today = new Date();
const data = JSON.parse(await readFile(new URL(target.dataPath, projectRoot)));
const asOf = new CvDocument(data).asOf;
if (countedPast(asOf, today)) {
  throw new Error(
    `${target.dataPath} counts lengths to ${asOf.year}-${String(asOf.month).padStart(2, '0')}, a month after ` +
      `these PDFs are made: nobody can check those lengths yet. Set asOf to this month or an earlier one.`
  );
}

// Printing needs a browser. Without one nothing is written, and the exit code says so: a build that wrote
// nothing must not read as one that wrote the CV.
const browser = findBrowser();
if (!browser) {
  console.error('generate-pdfs: no browser found, so no PDF was written.');
  console.error('Set CHROME_PATH to a Chrome or Chromium binary and run again.');
  process.exit(2);
}

// What the page is allowed to offer. The naming rule can name a file for any combination; only this run knows
// which ones it wrote, so it says so rather than leaving the page to guess.
const { files } = builtCv(target, data, layouts);
// The letters travel with the CV and are printed by the same browser, but never offered by the page: a letter
// names the employer it was written for, and leaves the machine only attached to an application.
const letters = builtLetters(target, data, layouts).files;
const writer = new NodeDirectoryWriter(new URL(`${target.outDir}/`, projectRoot));
const keep = (built) => async (layout, pdf) => {
  const { filename, path } = built.find((file) => file.layout === layout);
  await writer.write(filename, pdf);
  console.log(path);
};
await withServedPage(browser, 'generate-pdfs', async (chrome, site) => {
  const page = { ...site, target, name: data.name };
  await printLayouts(chrome, page, layouts, keep(files));
  if (letters.length) await printLetters(chrome, page, layouts, keep(letters));
});

const released = files.map(({ filename }) => filename);
await writeFile(
  new URL(target.manifestPath, projectRoot),
  `${JSON.stringify({ released }, null, 2)}\n`
);
console.log(`${target.manifestPath} — ${released.length} downloads`);

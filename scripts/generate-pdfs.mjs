import { readFile, writeFile } from 'node:fs/promises';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
import { PdfGenerationService } from '../core/PdfGenerationService.js';
import { PdfMakeRenderer } from '../adapters/PdfMakeRenderer.js';
import { NodeDirectoryWriter } from '../adapters/NodeDirectoryWriter.js';
import { GenerationTarget } from '../core/GenerationTarget.js';
import { LetterExporter } from '../core/LetterExporter.js';
import { CvDocument } from '../domain/CvDocument.js';
import { countedPast } from '../domain/Tenure.js';
import { findBrowser } from './lib/find-browser.mjs';
import { builtCv, printLayouts, withServedPage } from './lib/printed-cv.mjs';

/**
 * Writes the CV a recruiter downloads: the page, printed by Chrome in each layout (#144, #149).
 *
 * One CV and one design. pdfmake composed a second one from the model, in a layout of its own, and the page
 * and the PDF drifted apart. The PDF is now the page's print stylesheet on A4, and `npm run audit:print` and
 * `npm run audit:ats` read the files written here. A cover letter is still composed by pdfmake until it is a
 * page of its own (#151).
 */
const projectRoot = new URL('../', import.meta.url);
const target = GenerationTarget.fromArguments(process.argv.slice(2));
const { profile, locale } = target;
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
const writer = new NodeDirectoryWriter(new URL(`${target.outDir}/`, projectRoot));
await withServedPage(browser, 'generate-pdfs', (chrome, site) =>
  printLayouts(chrome, { ...site, target, name: data.name }, layouts, async (layout, pdf) => {
    const { filename, path } = files.find((file) => file.layout === layout);
    await writer.write(filename, pdf);
    console.log(path);
  })
);

if (LetterExporter.has(data)) {
  const lookup = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
  const cvMessages = JSON.parse(await readFile(new URL(`locales/${locale}/cv.json`, projectRoot)));
  const i18n = {
    t(key) {
      const [namespace, path] = key.includes(':') ? key.split(':') : ['ui', key];
      return namespace === 'cv' ? lookup(cvMessages, path) || key : key;
    }
  };
  // Inter, vendored under vendor/fonts/inter with its OFL licence. A missing file is an error, never a silent
  // fall back to Roboto: a letter that quietly ships in the wrong typeface looks like a decision nobody made.
  const fontDir = new URL('../vendor/fonts/inter/', import.meta.url);
  const face = async (file) => {
    try {
      return (await readFile(new URL(file, fontDir))).toString('base64');
    } catch (error) {
      throw new Error(`Missing embedded font ${file} — run the vendoring step before generating.`);
    }
  };
  pdfMake.addVirtualFileSystem({
    ...pdfFonts,
    'Inter-Regular.ttf': await face('Inter-Regular.ttf'),
    'Inter-Bold.ttf': await face('Inter-Bold.ttf')
  });
  pdfMake.fonts = {
    Inter: {
      normal: 'Inter-Regular.ttf',
      bold: 'Inter-Bold.ttf',
      italics: 'Inter-Regular.ttf',
      bolditalics: 'Inter-Bold.ttf'
    }
  };
  const letters = new PdfGenerationService({
    composer: new LetterExporter(null, i18n),
    renderer: new PdfMakeRenderer(pdfMake),
    writer
  });
  for (const layout of layouts) {
    const letter = await letters.generate(data, { profile, locale, layout });
    console.log(`${target.outDir}/${letter.filename}`);
  }
}

const released = files.map(({ filename }) => filename);
await writeFile(
  new URL(target.manifestPath, projectRoot),
  `${JSON.stringify({ released }, null, 2)}\n`
);
console.log(`${target.manifestPath} — ${released.length} downloads`);

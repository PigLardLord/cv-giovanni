import { readFile } from 'node:fs/promises';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
import { PdfExporter } from '../core/PdfExporter.js';
import { PdfGenerationService } from '../core/PdfGenerationService.js';
import { PdfMakeRenderer } from '../adapters/PdfMakeRenderer.js';
import { NodeDirectoryWriter } from '../adapters/NodeDirectoryWriter.js';

const profile = 'general';
const locale = 'en';
const layouts = ['classic', 'spotlight', 'technical'];
const data = JSON.parse(await readFile(new URL(`../profiles/${profile}/${locale}.json`, import.meta.url)));
const cvMessages = JSON.parse(await readFile(new URL(`../locales/${locale}/cv.json`, import.meta.url)));
const lookup = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const i18n = {
  t(key) {
    const [namespace, path] = key.includes(':') ? key.split(':') : ['ui', key];
    return namespace === 'cv' ? lookup(cvMessages, path) || key : key;
  }
};

// Inter, vendored under vendor/fonts/inter with its OFL licence. pdfmake's stock family maps
// `bold` to Roboto Medium 500, so a document that leans on weight for hierarchy could not have
// any. A missing file is an error, never a silent fall back to Roboto: a document that quietly
// ships in the wrong typeface looks like a decision nobody made.
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
    normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf',
    italics: 'Inter-Regular.ttf', bolditalics: 'Inter-Bold.ttf'
  }
};
const composer = new PdfExporter(null, i18n);
const renderer = new PdfMakeRenderer(pdfMake);
const releaseService = new PdfGenerationService({
  composer,
  renderer,
  writer: new NodeDirectoryWriter(new URL('../generated/', import.meta.url))
});
const qaService = new PdfGenerationService({
  composer,
  renderer,
  writer: new NodeDirectoryWriter(new URL('../generated/qa/', import.meta.url))
});

for (const layout of layouts) {
  const result = await releaseService.generate(data, { profile, locale, layout });
  console.log(`generated/${result.filename}`);
  for (const pageSize of ['A4', 'LETTER']) {
    for (const colorMode of ['color', 'monochrome']) {
      const variant = await qaService.generate(data, { profile, locale, layout, pageSize, colorMode, variant: true });
      console.log(`generated/qa/${variant.filename}`);
    }
  }
}

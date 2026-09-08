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

pdfMake.addVirtualFileSystem(pdfFonts);
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

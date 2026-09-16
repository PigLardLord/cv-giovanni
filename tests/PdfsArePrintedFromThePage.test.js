/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// One CV, printed from the page (#144). The generator stopped composing the CV with pdfmake, so nothing may
// still run the audit of pdfmake's twelve variants, and the audits that gate a publish have to read the files
// that are published: the print audit printing a copy of its own would pass whatever the generator wrote (#149).
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scripts = JSON.parse(read('package.json')).scripts;
const gates = read('.github/workflows/gates.yml');

/** The modules a script imports, read from its import statements. */
const imports = (source) =>
  [...source.matchAll(/^import\s[^;]*?\sfrom\s'([^']+)';/gms)].map(([, path]) => path);

/** One step of the gates job, from its `- name:` to the next. */
const step = (name) => {
  const start = gates.indexOf(`- name: ${name}\n`);
  if (start < 0) return null;
  const next = gates.indexOf('\n      - ', start + 1);
  return gates.slice(start, next < 0 ? undefined : next);
};

describe('the PDFs are printed from the page', () => {
  test('the check reads imports, and finds a step by its name', () => {
    expect(imports("import a from './a.js';\nimport {\n  b\n} from '../b.mjs';\n")).toEqual([
      './a.js',
      '../b.mjs'
    ]);
    expect(step('Tests')).toContain('run: npm test');
    expect(step('No such step')).toBeNull();
  });

  test('the generator prints the CV and composes none', () => {
    const generator = imports(read('scripts/generate-pdfs.mjs'));

    expect(generator).toContain('./lib/printed-cv.mjs');
    expect(generator).not.toContain('../core/PdfExporter.js');
  });

  // The cover letter is printed from letter.html too (#151), so pdfmake is left with nothing to write and can go
  // (#153).
  test('the generator imports nothing of pdfmake, the cover letter included', () => {
    const generator = imports(read('scripts/generate-pdfs.mjs'));

    expect(generator.filter((path) => path.startsWith('pdfmake'))).toEqual([]);
    expect(generator).not.toContain('../core/LetterExporter.js');
    expect(generator).not.toContain('../core/PdfGenerationService.js');
    expect(generator).not.toContain('../adapters/PdfMakeRenderer.js');
  });

  test('the print audit reads the files the generator wrote, and prints nothing itself', () => {
    const audit = imports(read('scripts/audit-print.mjs'));

    expect(audit).toContain('./lib/printed-cv.mjs');
    expect(audit).not.toContain('./lib/print-page.mjs');
    expect(audit).not.toContain('./lib/chrome.mjs');
  });

  test('verify:pdf builds, then runs the print and ATS audits, and never the pdfmake audit', () => {
    expect(scripts['verify:pdf']).toBe(
      'npm run build:pdf && npm run audit:print && npm run audit:ats'
    );
  });

  // Chrome stamps each print with its date, so a committed PDF changed on every build, and the copies nobody
  // rebuilt offered a CV older than the page: on main they lacked what #55 added. CI builds what it publishes.
  test('nothing the build writes is committed', () => {
    const tracked = execFileSync('git', ['ls-files', 'generated'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8'
    });

    expect(tracked.split('\n').filter(Boolean)).toEqual(['generated/.gitignore']);
  });

  test('CI builds with Chrome, then audits what it built, and runs no audit of pdfmake', () => {
    const build = step('Print the CV from the page');

    expect(build).toContain('run: npm run build:pdf');
    expect(build).toContain('CHROME_PATH:');
    expect(gates).not.toContain('audit:pdf');
    expect(gates.indexOf('run: npm run build:pdf')).toBeLessThan(
      gates.indexOf('run: npm run audit:ats')
    );
    expect(gates.indexOf('run: npm run build:pdf')).toBeLessThan(
      gates.indexOf('run: npm run audit:print')
    );
  });
});

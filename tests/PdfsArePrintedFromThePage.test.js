/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// One CV, printed from the page (#144). pdfmake composed a second one until #149, and went with its audit in
// #153. The audits that gate a publish have to read the files that are published: the print audit printing a
// copy of its own would pass whatever the generator wrote (#149).
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts;
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

  test('the generator prints the CV and imports nothing of pdfmake', () => {
    const generator = imports(read('scripts/generate-pdfs.mjs'));

    expect(generator).toContain('./lib/printed-cv.mjs');
    expect(generator.filter((path) => /(?:^|\/)pdfmake(?:[/.]|$)/.test(path))).toEqual([]);
  });

  // The cover letter is printed from letter.html too (#151), so pdfmake was left with nothing to write and went
  // (#153).
  test('pdfmake is no dependency, the cover letter included', () => {
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('pdfmake');
  });

  test('the print audit reads the files the generator wrote, and prints nothing itself', () => {
    const audit = imports(read('scripts/audit-print.mjs'));

    expect(audit).toContain('./lib/printed-cv.mjs');
    expect(audit).not.toContain('./lib/print-page.mjs');
    expect(audit).not.toContain('./lib/chrome.mjs');
  });

  test('verify:pdf builds, then runs the print and ATS audits', () => {
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

  test('CI builds with Chrome, then audits what it built', () => {
    const build = step('Print the CV from the page');

    expect(build).toContain('run: npm run build:pdf');
    expect(build).toContain('CHROME_PATH:');
    expect(gates.indexOf('run: npm run build:pdf')).toBeLessThan(
      gates.indexOf('run: npm run audit:ats')
    );
    expect(gates.indexOf('run: npm run build:pdf')).toBeLessThan(
      gates.indexOf('run: npm run audit:print')
    );
  });
});

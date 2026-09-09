import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer } from './serve.mjs';

/**
 * What the browser prints, checked on the paper rather than on the stylesheet.
 *
 * `audit-pdfs.mjs` scores the documents pdfmake builds. This one scores the other
 * artefact: the page a reader gets from the browser's own Print. They are not the
 * same document and they fail in different ways — the printed page hid ten defects
 * that no existing check could see, among them a line of text that rendered white
 * on white and a skills table that extracted as two columns with every name torn
 * from its category.
 *
 * Nothing here reads CSS. Every check reads either the text layer poppler pulls out
 * of the PDF or the pixels the page actually put on the paper.
 */
const projectUrl = new URL('..', import.meta.url);
const profile = JSON.parse(await readFile(new URL('profiles/general/en.json', projectUrl)));
const labels = JSON.parse(await readFile(new URL('locales/en/cv.json', projectUrl))).sections;
const manifest = JSON.parse(await readFile(new URL('config/cv-manifest.json', projectUrl)));

const DPI = 150;
const MM = 25.4;
const CONTRAST_FLOOR = 4.5;
const MARGIN_FLOOR_MM = 10;
const SIDE_TOLERANCE_MM = 1.5;

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const strings = (node) => typeof node === 'string' ? [node]
  : node && typeof node === 'object' ? Object.values(node).flatMap(strings) : [];

const mustHave = [profile.name, profile.title, profile.email, labels.experience, labels.skills,
  'Cortado Mobile Solutions', 'Swift', 'CI/CD', labels.education, labels.languages];

// Every hyphenated compound the data writes. A line broken at an existing hyphen
// extracts without it, so "offline-first" arrives welded shut as "offlinefirst":
// right on the page, unfindable by anyone searching the canonical spelling.
const brokenForms = [...new Set(strings(profile).flatMap((text) =>
  text.match(/[A-Za-z0-9]+-[A-Za-z0-9]+/g) || []))]
  .map((compound) => ({ compound, broken: new RegExp(`\\b${escapeForRegExp(compound.replace(/-/g, ''))}\\b`) }));

// A degree and its school must stay adjacent. The web renderer writes
// "<school> (<period>)" where the PDF writes "<school> · <period>".
const educationPairs = profile.education.map((item) =>
  new RegExp(`${escapeForRegExp(item.degree)}\\s+${escapeForRegExp(item.school)}\\s*[·(]\\s*${escapeForRegExp(item.period)}`));

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
  let left = page.width, right = -1, top = page.height, bottom = -1;
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
    left: mm(left), top: mm(top),
    right: mm(page.width - right), bottom: mm(page.height - bottom)
  };
}

/** Every word whose darkest pixel is lighter than the contrast floor allows. */
function faintWords(path, pages) {
  const xml = execFileSync('pdftotext', ['-bbox-layout', path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const scale = DPI / 72;
  const faint = [];
  let pageIndex = -1;
  for (const chunk of xml.split('<page ')) {
    if (pageIndex >= 0 && pageIndex < pages.length) {
      const page = pages[pageIndex];
      for (const word of chunk.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
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
          faint.push({ page: pageIndex + 1, text, ratio: Number(contrastOnWhite(darkest).toFixed(2)) });
        }
      }
    }
    pageIndex += 1;
  }
  return faint;
}

/** Find a browser to print with. Guessing is not allowed to look like a pass. */
function findBrowser() {
  const named = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  const paths = [
    process.env.CHROME_PATH,
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']
      .flatMap((suffix) => {
        const cache = join(homedir(), '.cache', 'ms-playwright');
        if (!existsSync(cache)) return [];
        try {
          return execFileSync('ls', [cache], { encoding: 'utf8' }).split('\n')
            .filter((entry) => entry.startsWith('chromium-'))
            .map((entry) => join(cache, entry, suffix));
        } catch { return []; }
      })
  ].filter(Boolean);

  for (const candidate of paths) {
    if (existsSync(candidate)) return candidate;
  }
  for (const name of named) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch { /* keep looking */ }
  }
  return null;
}

/**
 * Run the browser without blocking the event loop.
 *
 * execFileSync would be simpler and would also deadlock: the page is served by
 * this same process, and a blocked loop cannot answer the request the browser
 * is waiting on.
 * @param {string} command - Browser binary
 * @param {string[]} args - Arguments, including --print-to-pdf and the URL
 * @returns {Promise<void>} Resolves when the file has been written
 */
function print(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`the browser did not finish printing within 120s`));
    }, 120000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`the browser exited with ${code}`));
    });
  });
}

const browser = findBrowser();
if (!browser) {
  console.error('audit-print: no browser found, so nothing was checked.');
  console.error('Set CHROME_PATH to a Chrome or Chromium binary and run again.');
  console.error('This exits non-zero on purpose: an audit that did not run must not read as a pass.');
  process.exit(2);
}

const server = createStaticServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const workspace = await mkdtemp(join(tmpdir(), 'mycv-print-'));
const rows = [];

try {
  for (const layout of manifest.layouts) {
    const pdf = join(workspace, `${layout}.pdf`);
    process.stderr.write(`audit-print: printing ${layout}\u2026\n`);
    await print(browser, [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=8000',
      '--no-pdf-header-footer', `--print-to-pdf=${pdf}`,
      `http://127.0.0.1:${port}/index.html?layout=${layout}`
    ]);

    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
    const fonts = execFileSync('pdffonts', [pdf], { encoding: 'utf8' });
    const flat = text.replace(/\s+/g, ' ');
    const pageCount = Number(info.match(/Pages:\s+(\d+)/)?.[1]);

    const raster = await mkdtemp(join(workspace, 'raster-'));
    const pages = await renderPages(pdf, raster);
    const margins = pages.map(inkMargins).filter(Boolean);
    const faint = faintWords(pdf, pages);
    await rm(raster, { recursive: true, force: true });

    const order = [profile.name, profile.title, labels.experience].map((term) => text.indexOf(term));
    const skillsFrom = flat.indexOf(labels.skills);
    const categories = profile.skills.map((group) => group.category);

    const checks = {
      // A4 to within a couple of points: the browser rounds the page box to whole
      // device pixels, so it prints 594.96 x 841.92 where the paper is 595.28 x 841.89.
      format: (() => {
        const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
        return !!size && Math.abs(Number(size[1]) - 595.28) <= 2 && Math.abs(Number(size[2]) - 841.89) <= 2;
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
        const nextCategory = categories.filter((name) => name !== group.category)
          .map((name) => flat.indexOf(name, at + 1)).filter((index) => index > 0)
          .sort((a, b) => a - b)[0] ?? Infinity;
        return at >= 0 && first >= 0 && first < nextCategory;
      }),
      rolesPresent: profile.relevant_experience.every((job) =>
        flat.includes(job.title) && flat.includes(job.company)),
      // Ink that reaches the paper has to be readable on it. Measured per word
      // against what was actually printed, not against the declared colour.
      contrast: faint.length === 0,
      // A margin no narrower than the floor, and the two sides within a
      // millimetre and a half of each other — an asymmetry means something is
      // overflowing its column rather than sitting in it.
      margins: margins.length > 0 && margins.every((box) =>
        Math.min(box.left, box.right, box.top, box.bottom) >= MARGIN_FLOOR_MM
        && Math.abs(box.left - box.right) <= SIDE_TOLERANCE_MM),
      // Nothing in the text layer that the data did not write: no colour emoji,
      // no bare digits left behind by a CSS counter.
      textLayerClean: !/\p{Extended_Pictographic}/u.test(text) && !/^\s*\d{1,2}\s*$/m.test(text),
      // A fallback typeface changes every line break, and with them the page
      // count and the measure. If Inter did not arrive, the rest is not the
      // document anyone will print.
      intendedTypeface: /Inter/.test(fonts)
    };

    const passed = Object.values(checks).filter(Boolean).length;
    rows.push({
      layout, pages: pageCount, score: `${passed}/${Object.keys(checks).length}`,
      checks, faint: faint.slice(0, 8), margins
    });
  }
} finally {
  server.closeAllConnections?.();
  server.close();
  await rm(workspace, { recursive: true, force: true });
}

const failures = rows.filter((row) => Object.values(row.checks).some((value) => !value));
const report = [
  '# Print quality matrix', '',
  'What the browser prints, measured on the artefact: the text layer poppler extracts',
  'and the pixels the page put on the paper. Regenerate with `npm run audit:print`.', '',
  `Layouts: ${rows.length}`, '',
  '| Layout | Pages | Score | Worst side margin |', '|---|---:|---:|---:|',
  ...rows.map((row) => {
    const worst = row.margins.length
      ? Math.min(...row.margins.flatMap((box) => [box.left, box.right])).toFixed(1)
      : '—';
    return `| ${row.layout} | ${row.pages} | ${row.score} | ${worst}mm |`;
  }), '',
  'Checks: A4, at most two pages, required ATS text in the case the catalogue wrote it,',
  'reading order, canonical hyphenated compounds, degree beside its school, every skill',
  'attached to its category, every role present, every word at 4.5:1 on paper, margins',
  `no narrower than ${MARGIN_FLOOR_MM}mm and symmetric within ${SIDE_TOLERANCE_MM}mm, a text layer carrying nothing`,
  'the data did not write, and the intended typeface embedded.'
].join('\n');

await writeFile(new URL('docs/PRINT_AUDIT.md', projectUrl), `${report}\n`);
console.log(report);

if (failures.length) {
  console.error('');
  console.error(JSON.stringify(failures.map(({ layout, checks, faint }) => ({
    layout,
    failed: Object.entries(checks).filter(([, value]) => !value).map(([name]) => name),
    faint
  })), null, 2));
  process.exitCode = 1;
}

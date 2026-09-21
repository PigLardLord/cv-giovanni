import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CvFiles } from '../../core/CvFiles.js';
import { LetterContent } from '../../core/LetterContent.js';
import { ProfileCompleteness } from '../../core/ProfileCompleteness.js';
import { CoverLetter } from '../../domain/CoverLetter.js';
import { createStaticServer, previewKey } from '../serve.mjs';
import { openBrowser } from './chrome.mjs';
import { printPage } from './print-page.mjs';
import { rendered, revealed } from './page-ready.mjs';

/**
 * The CV a recruiter downloads: the page, printed by Chrome in each layout (#144, #149). And the cover letter a
 * tailored profile carries, printed the same way from its own page (#151).
 *
 * pdfmake used to compose a second design from the model, and the two documents said different things. The
 * generator prints the pages instead, and the print audit reads what they printed. Both find the files through
 * `builtCv` and `builtLetters`, so the audit cannot read one file while the generator writes another.
 */

/** Each layout's file under a naming rule, and the ones not on disk. */
function built(target, layouts, name, exists) {
  const files = layouts.map((layout) => {
    const filename = name({ profile: target.profile, locale: target.locale, layout });
    return { layout, filename, path: `${target.outDir}/${filename}` };
  });
  return { files, missing: files.map(({ path }) => path).filter((path) => !exists(path)) };
}

/**
 * The file each layout is printed to, and the ones not there.
 * @param {{ profile: string, locale: string, outDir: string }} target - The CV and where its files go
 * @param {object} data - The profile, which names the files after the candidate
 * @param {string[]} layouts - The layouts the manifest declares
 * @param {(path: string) => boolean} [exists] - Whether a file is on disk
 * @returns {{ files: { layout: string, filename: string, path: string }[], missing: string[] }} Every file,
 *   and the ones missing
 */
export function builtCv(target, data, layouts, exists = existsSync) {
  const naming = new CvFiles();
  return built(target, layouts, (options) => naming.filename(data, options), exists);
}

/**
 * The files an audit of one CV reads: that CV in each layout, and the letter beside each when the profile carries
 * one — the ones on disk, sorted by path (#248).
 *
 * Chosen by the naming rule, never by listing the directory: every published CV prints into generated/, and an
 * audit that listed it graded every locale's PDFs against one profile.
 * @param {{ profile: string, locale: string, outDir: string }} target - The CV and where its files go
 * @param {object} data - The profile, its letter included
 * @param {string[]} layouts - The layouts the manifest declares
 * @param {(path: string) => boolean} [exists] - Whether a file is on disk
 * @returns {{ path: string, isCover: boolean }[]} Each file an audit of the CV reads, and whether it is a letter
 */
export function auditedFiles(target, data, layouts, exists = existsSync) {
  return [
    ...builtCv(target, data, layouts, exists).files.map(({ path }) => ({ path, isCover: false })),
    ...builtLetters(target, data, layouts, exists).files.map(({ path }) => ({
      path,
      isCover: true
    }))
  ]
    .filter(({ path }) => exists(path))
    .sort((one, other) => one.path.localeCompare(other.path));
}

/**
 * The cover letter each layout is printed to, beside its CV, and the ones not there. None for a profile that
 * carries no letter, which is every profile the repository publishes.
 * @param {{ profile: string, locale: string, outDir: string }} target - The CV and where its files go
 * @param {object} data - The profile, its letter included
 * @param {string[]} layouts - The layouts the manifest declares
 * @param {(path: string) => boolean} [exists] - Whether a file is on disk
 * @returns {{ files: { layout: string, filename: string, path: string }[], missing: string[] }} Every letter,
 *   and the ones missing
 */
export function builtLetters(target, data, layouts, exists = existsSync) {
  if (!LetterContent.has(data)) return { files: [], missing: [] };
  const naming = new CvFiles();
  return built(target, layouts, (options) => naming.letterFilename(data, options), exists);
}

/**
 * What the build warns about a profile's letter before it prints it: every problem the letter reports, a field it
 * still misses or a recipient longer than the address zone holds (the review of #151). The letter is printed anyway,
 * as written, and `npm run audit:print` is what fails it; the warning says first which profile to correct.
 * @param {string} dataPath - The profile's path, as the build was given it
 * @param {object} data - The profile
 * @returns {string[]} One warning per problem, none for a profile without a letter
 */
export function letterWarnings(dataPath, data) {
  if (!LetterContent.has(data)) return [];
  return new CoverLetter(data.letter).problems.map(
    (problem) => `warning: the cover letter in ${dataPath} — ${problem}`
  );
}

/**
 * What the build warns about a profile before it prints it: each field it leaves out that a reader looks for, a degree's
 * period, a certification's issuer or year, a role's location beside roles that name theirs (#178). The shape leaves
 * them optional, so the CV is printed anyway; the warning says first which profile to complete, and what its print
 * loses without them.
 * @param {string} dataPath - The profile's path, as the build was given it
 * @param {object} data - The profile
 * @returns {string[]} One warning per omission, none for a profile that leaves nothing out
 */
export function profileWarnings(dataPath, data) {
  return ProfileCompleteness.omissions(data).map(
    ({ path, reason }) => `warning: ${dataPath} — ${path} ${reason}`
  );
}

/**
 * Prints each layout from the page, in order, once its CV has rendered and its print fonts have loaded.
 * @param {{ send: Function, next: Function, evaluate: Function }} chrome - A DevTools session on a page tab
 * @param {{ origin: string, key: string, target: object, name: string }} site - Where the page is served, the
 *   run's key that opens a tailored profile, the CV, and the candidate's name the rendered page shows
 * @param {string[]} layouts - The layouts to print
 * @param {(layout: string, pdf: Buffer) => Promise<void>} write - Keeps one layout's PDF
 * @param {{ page?: string, start?: string }} [document] - The page to print, and the element that names the
 *   candidate once it has rendered
 * @returns {Promise<void>} Resolves once every layout is written
 */
export async function printLayouts(
  chrome,
  { origin, key, target, name },
  layouts,
  write,
  { page = 'index.html', start = '#name' } = {}
) {
  await chrome.send('Page.enable');
  for (const layout of layouts) {
    const address = `${origin}/${page}?layout=${layout}&profile=${target.profile}&lang=${target.locale}&key=${key}`;
    await write(
      layout,
      await printPage(chrome, address, {
        ready: [rendered(layout, start, name, target.locale), revealed]
      })
    );
  }
}

/**
 * Prints the cover letter's page in each layout, once its letterhead names the candidate (#151). The letter takes
 * its layout from the CV it travels with, and is printed by the same browser, in the same run.
 * @param {{ send: Function, next: Function, evaluate: Function }} chrome - A DevTools session on a page tab
 * @param {{ origin: string, key: string, target: object, name: string }} site - As for `printLayouts`
 * @param {string[]} layouts - The layouts to print
 * @param {(layout: string, pdf: Buffer) => Promise<void>} write - Keeps one layout's letter
 * @returns {Promise<void>} Resolves once every letter is written
 */
export function printLetters(chrome, site, layouts, write) {
  return printLayouts(chrome, site, layouts, write, { page: 'letter.html', start: '#letter-name' });
}

/**
 * Serves the site to a headless Chrome for one run, and takes both down afterwards, whatever happened.
 *
 * The browser holds the run's key, so a tailored profile under applications/ loads (#71).
 * @param {string} binary - The Chrome or Chromium to run
 * @param {string} caller - The script's name, for what it leaves behind
 * @param {(chrome: object, site: { origin: string, key: string }) => Promise<T>} use - The run
 * @returns {Promise<T>} What the run returned
 * @template T
 */
export async function withServedPage(binary, caller, use) {
  const key = previewKey();
  const server = createStaticServer(undefined, { key });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const workspace = await mkdtemp(join(tmpdir(), 'mycv-print-'));
  let chrome;
  try {
    chrome = await openBrowser(binary, join(workspace, 'browser'));
    return await use(chrome, { origin: `http://127.0.0.1:${server.address().port}`, key });
  } finally {
    await chrome?.close();
    server.closeAllConnections?.();
    server.close();
    // A browser profile can still be written to for a moment after the browser exits (#89).
    await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      (error) => console.error(`${caller}: left ${workspace} behind — ${error.message}`)
    );
  }
}

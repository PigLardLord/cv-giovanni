import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CvFiles } from '../../core/CvFiles.js';
import { createStaticServer, previewKey } from '../serve.mjs';
import { openBrowser } from './chrome.mjs';
import { printPage } from './print-page.mjs';
import { rendered, revealed } from './page-ready.mjs';

/**
 * The CV a recruiter downloads: the page, printed by Chrome in each layout (#144, #149).
 *
 * pdfmake used to compose a second design from the model, and the two documents said different things. The
 * generator prints the page instead, and the print audit reads what it printed. Both find the files through
 * `builtCv`, so the audit cannot read one file while the generator writes another.
 */

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
  const files = layouts.map((layout) => {
    const filename = naming.filename(data, {
      profile: target.profile,
      locale: target.locale,
      layout
    });
    return { layout, filename, path: `${target.outDir}/${filename}` };
  });
  return { files, missing: files.map(({ path }) => path).filter((path) => !exists(path)) };
}

/**
 * Prints each layout from the page, in order, once its CV has rendered and its print fonts have loaded.
 * @param {{ send: Function, next: Function, evaluate: Function }} chrome - A DevTools session on a page tab
 * @param {{ origin: string, key: string, target: object, name: string }} site - Where the page is served, the
 *   run's key that opens a tailored profile, the CV, and the candidate's name the rendered page shows
 * @param {string[]} layouts - The layouts to print
 * @param {(layout: string, pdf: Buffer) => Promise<void>} write - Keeps one layout's PDF
 * @returns {Promise<void>} Resolves once every layout is written
 */
export async function printLayouts(chrome, { origin, key, target, name }, layouts, write) {
  await chrome.send('Page.enable');
  for (const layout of layouts) {
    const address = `${origin}/index.html?layout=${layout}&profile=${target.profile}&lang=${target.locale}&key=${key}`;
    await write(
      layout,
      await printPage(chrome, address, {
        ready: [rendered(layout, '#name', name, target.locale), revealed]
      })
    );
  }
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

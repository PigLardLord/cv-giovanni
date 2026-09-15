import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer, previewKey } from './serve.mjs';
import { writeReport } from './lib/write-report.mjs';
import { findBrowser } from './lib/find-browser.mjs';
import { screenCopy } from './lib/screen-copy.mjs';
import { RECORD_LAYOUT_SHIFTS, layoutShift } from './lib/layout-shift.mjs';
import { downloadReach } from './lib/download-reach.mjs';
import { GenerationTarget } from '../core/GenerationTarget.js';

/**
 * What a reader copies off the screen, checked in a browser that lays the page out.
 *
 * The unit tests read the page through JSDOM, which applies no stylesheet, so nothing in the suite can
 * see what a selection holds. `audit-print.mjs` reads the printed text layer; this reads the screen's.
 * Each layout is opened in headless Chrome at a desktop and a phone width, its CV is selected, and the
 * selection is checked against the profile (#62).
 */
const projectUrl = new URL('..', import.meta.url);
const target = GenerationTarget.fromArguments(process.argv.slice(2));

/** Read a file the audit cannot run without. Missing means unchecked, which is exit 2. */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(new URL(path, projectUrl)));
  } catch (error) {
    console.error(`audit-screen: cannot read ${path} — nothing was checked.`);
    console.error(error.message);
    process.exit(2);
  }
}
const profile = await readJson(target.dataPath);
const labels = (await readJson(`locales/${target.locale}/cv.json`)).sections;
const manifest = await readJson('config/cv-manifest.json');

/** A desktop and a phone, the two ways a recruiter meets the page. */
const SIZES = [
  { width: 1280, height: 900, mobile: false },
  { width: 390, height: 844, mobile: true }
];

/**
 * Where each layout's CV begins and ends. Nerd Mode writes it into the editor; the other two lay it out
 * from the masthead to the end of the main column. The download footer after it is the page's.
 */
const BOUNDS = {
  nerd: ['#source-code', '#source-code'],
  spotlight: ['.hero-section', '.main-content'],
  technical: ['.hero-section', '.main-content']
};

/**
 * Where a layout pins its top Download link, so it stays on screen as the page scrolls: Nerd Mode fixes it to the
 * end of its toolbar from 769px up. The other layouts let it scroll away with the switcher (#59).
 */
const PINNED = { nerd: true };

const unbounded = manifest.layouts.filter((layout) => !Object.hasOwn(BOUNDS, layout));
if (unbounded.length) {
  console.error(`audit-screen: no bounds for ${unbounded.join(', ')} — nothing was checked.`);
  process.exit(2);
}

const browser = findBrowser();
if (!browser) {
  console.error('audit-screen: no browser found, so nothing was checked.');
  console.error('Set CHROME_PATH to a Chrome or Chromium binary and run again.');
  console.error(
    'This exits non-zero on purpose: an audit that did not run must not read as a pass.'
  );
  process.exit(2);
}

/** Rejects after `ms`, and clears its timer either way, so no deadline holds the process open. */
const within = (promise, ms, what) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} within ${ms / 1000}s`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
};

/**
 * Chrome with its DevTools socket open, and the three things this audit asks of it.
 *
 * Every wait has a deadline, and whatever ends the connection — the socket closing, the browser
 * exiting — fails every command still waiting on it: a promise nothing will settle would hold the
 * audit open, and its cleanup with it. Until the socket is open the browser belongs to this function,
 * which kills it on any failure; after that it belongs to the caller, through `close`.
 */
async function openBrowser(binary, dataDir) {
  const child = spawn(
    binary,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      `--user-data-dir=${dataDir}`,
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  // Settles once the browser is gone, whether it stopped or never started.
  const gone = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
  const pending = new Map();
  const listeners = new Set();
  let socket;
  let ended = null;
  const failAll = (reason) => {
    ended ??= reason;
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  };
  // Resolves once the browser has exited. Killed outright, its renderers outlived it and went on writing
  // into the profile directory the audit removes next: on the CI runner that removal failed with
  // ENOTEMPTY on every run, after every check had passed, and the audit exited 1 with no report (#89).
  // Asked to stop, Chrome closes its profile first; only a browser that does not stop is killed.
  const close = async () => {
    socket?.close();
    child.kill('SIGTERM');
    const stopped = await within(gone, 5000, 'the browser did not stop').then(
      () => true,
      () => false
    );
    if (!stopped) {
      child.kill('SIGKILL');
      await within(gone, 5000, 'the browser did not exit').catch(() => {});
    }
  };

  try {
    const address = await within(
      new Promise((resolve, reject) => {
        let output = '';
        child.on('error', (error) =>
          reject(new Error(`the browser did not start: ${error.message}`))
        );
        child.on('exit', (code) =>
          reject(new Error(`the browser exited with ${code} before listening`))
        );
        child.stderr.on('data', (chunk) => {
          output += chunk;
          const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
          if (match) resolve(match[1]);
        });
      }),
      30000,
      'the browser printed no DevTools address'
    );
    const pages = await within(
      fetch(`http://127.0.0.1:${new URL(address).port}/json/list`).then((response) =>
        response.json()
      ),
      10000,
      'the browser listed no page'
    );
    socket = new WebSocket(pages.find((entry) => entry.type === 'page').webSocketDebuggerUrl);
    await within(
      new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', () => reject(new Error('the DevTools socket failed')), {
          once: true
        });
      }),
      10000,
      'the DevTools socket did not open'
    );
  } catch (error) {
    await close();
    throw error;
  }

  child.on('exit', (code) => failAll(`the browser exited with ${code}`));
  socket.addEventListener('close', () => failAll('the DevTools socket closed'));
  socket.addEventListener('error', () => failAll('the DevTools socket failed'));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) {
      listeners.forEach((listener) => listener(message));
    }
  });

  let sequence = 0;
  const send = (method, params = {}) =>
    within(
      new Promise((resolve, reject) => {
        if (ended) {
          reject(new Error(ended));
          return;
        }
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      }),
      30000,
      `${method} got no answer`
    );
  const next = (method) =>
    new Promise((resolve) => {
      const listener = (message) => {
        if (message.method !== method) return;
        listeners.delete(listener);
        resolve(message.params);
      };
      listeners.add(listener);
    });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }
    return result.value;
  };
  return { send, next, evaluate, close };
}

/**
 * Resolves once the layout has rendered the profile: the layout applied, the language resolved, the
 * candidate's name inside the CV's first element, and the fonts arrived. Text alone was not enough —
 * the masthead holds a static pin before any profile has loaded.
 */
const rendered = (layout, start, name, locale) => `new Promise((resolve) => {
  const wait = () => {
    const ready =
      document.body.dataset.layout === ${JSON.stringify(layout)} &&
      (document.documentElement.lang || '').startsWith(${JSON.stringify(locale)}) &&
      (document.querySelector(${JSON.stringify(start)})?.textContent || '').includes(${JSON.stringify(name)});
    if (ready) document.fonts.ready.then(() => setTimeout(resolve, 500));
    else setTimeout(wait, 100);
  };
  wait();
})`;

/**
 * Resolves once the page reveals itself. script.js holds the first paint until the CV is in the page and the
 * downloads are offered (#74), so nothing is selected, measured or tabbed to on a page still hidden.
 */
const revealed = `new Promise((resolve) => {
  const wait = () => (document.body.hasAttribute('data-rendered') ? resolve() : setTimeout(wait, 50));
  wait();
})`;

/** Selects the CV from its first element to its last, the way a reader drags across it, and reads it. */
const selection = (start, end) => `(() => {
  const first = document.querySelector(${JSON.stringify(start)});
  const last = document.querySelector(${JSON.stringify(end)});
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  const selected = getSelection();
  selected.removeAllRanges();
  selected.addRange(range);
  const text = selected.toString();
  selected.removeAllRanges();
  return text;
})()`;

/**
 * The lines a control's own text renders on: one rectangle per line box, leaving out the icon `aria-hidden`
 * hides. Nothing marks a label to find it by, because script.js drops `data-i18n` once it translates (#107).
 */
const LINES = `(control) => {
  const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
  const tops = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden="true"]')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) if (rect.width > 0) tops.push(rect.top);
  }
  tops.sort((a, b) => a - b);
  return tops.filter((top, index) => index === 0 || top - tops[index - 1] > 2).length;
}`;

/**
 * Every copy of the Download link, top copy first: whether it shows, how tall it renders, where it spans down
 * and across the page, so the first screen is the first screen whatever the page was scrolled to, and on how
 * many lines its label renders. The values are the browser's own, unrounded: rounding is the report's, and
 * 45.4px is not 44px ±1.
 */
const downloadLinks = `(() => {
  const lines = ${LINES};
  return [...document.querySelectorAll('[data-download-pdf]')].map((link) => {
    const box = link.getBoundingClientRect();
    return {
      place: link.closest('footer') ? 'footer' : 'top',
      display: getComputedStyle(link).display,
      top: box.top + scrollY,
      bottom: box.bottom + scrollY,
      left: box.left + scrollX,
      right: box.right + scrollX,
      height: box.height,
      lines: lines(link)
    };
  });
})()`;

/** The footer's other buttons: whether they show, how tall they render (#109), and their label's lines (#107). */
const footerButtons = `(() => {
  const lines = ${LINES};
  return [...document.querySelectorAll('footer .print-button:not([data-download-pdf])')].map((button) => ({
    place: 'footer',
    label: button.textContent.trim().replace(/\\s+/g, ' '),
    display: getComputedStyle(button).display,
    lines: lines(button),
    height: Math.round(button.getBoundingClientRect().height)
  }));
})()`;

/** The top copy after scrolling to the end: still inside the viewport, and what a tap on its middle would hit. */
const afterScrolling = `new Promise((resolve) => {
  scrollTo(0, document.documentElement.scrollHeight);
  setTimeout(() => {
    const link = document.querySelector('[data-download-pdf]');
    const box = link.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const inViewport = box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
    resolve({ inViewport, topmost: Boolean(hit && link.contains(hit)) });
  }, 300);
})`;

/**
 * The focused top copy's ring, once its transitions finish, and the colour behind it: the backgrounds under a
 * point just outside the link's left edge, where the ring is drawn, painted one over another down to the first
 * opaque one. A ring still changing after two seconds is not measured: the run stops and checks nothing, rather
 * than judging a colour on its way somewhere else.
 */
const focusRing = `(async () => {
  const link = document.querySelector('[data-download-pdf]');
  const settled = Promise.all(link.getAnimations().map((animation) => animation.finished));
  await Promise.race([
    settled,
    new Promise((resolve, reject) =>
      setTimeout(() => reject(new Error('the focus ring was still changing after 2 seconds')), 2000)
    )
  ]);
  const box = link.getBoundingClientRect();
  const painted = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const [red, green, blue, alpha = 1] = (getComputedStyle(node).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
      if (blue === undefined || alpha === 0) continue;
      layers.push([red, green, blue, alpha]);
      if (alpha >= 1) break;
    }
    const colour = layers.reverse().reduce(
      (beneath, [red, green, blue, alpha]) => [red, green, blue].map((channel, index) => channel * alpha + beneath[index] * (1 - alpha)),
      [255, 255, 255]
    );
    return 'rgb(' + colour.map(Math.round).join(', ') + ')';
  };
  const under = document
    .elementsFromPoint(Math.max(0, box.left - 3), box.top + box.height / 2)
    .find((element) => !link.contains(element));
  const outline = getComputedStyle(link);
  return {
    focused: document.activeElement === link,
    style: outline.outlineStyle,
    width: parseFloat(outline.outlineWidth) || 0,
    ring: outline.outlineColor,
    behind: painted(under || document.body)
  };
})()`;

// The browser this audit starts holds the run's key, so a tailored profile under applications/ loads (#71).
const key = previewKey();
const server = createStaticServer(undefined, { key });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const dataDir = await mkdtemp(join(tmpdir(), 'mycv-screen-'));
const rows = [];
let chrome;

try {
  chrome = await openBrowser(browser, dataDir);
  await chrome.send('Page.enable');
  await chrome.send('Runtime.enable');
  // Every document this tab opens records its layout shifts from its first byte (#74).
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORD_LAYOUT_SHIFTS });
  for (const layout of manifest.layouts) {
    const [start, end] = BOUNDS[layout];
    for (const size of SIZES) {
      process.stderr.write(`audit-screen: ${layout} at ${size.width}px…\n`);
      await chrome.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1 });
      const loaded = chrome.next('Page.loadEventFired');
      const address = `http://127.0.0.1:${port}/index.html?layout=${layout}&profile=${target.profile}&lang=${target.locale}&key=${key}`;
      await chrome.send('Page.navigate', { url: address });
      await within(loaded, 30000, `${layout} did not load`);
      await within(
        chrome.evaluate(rendered(layout, start, profile.name, target.locale)),
        30000,
        `${layout} did not render its CV`
      );
      await within(chrome.evaluate(revealed), 30000, `${layout} did not reveal its page`);
      // From navigation to the fonts being ready, which `rendered` waited for. A page that recorded
      // nothing did not run the recorder, and a shift nobody measured is not a page holding still.
      const recorded = await chrome.evaluate('window.__layoutShifts');
      if (!Array.isArray(recorded)) throw new Error(`${layout} recorded no layout shifts`);
      const shift = layoutShift(recorded);
      const copied = await chrome.evaluate(selection(start, end));
      if (copied === null) throw new Error(`${layout} has no ${start} or no ${end}`);

      const copy = screenCopy(copied, profile, { skillsLabel: labels.skills });

      // The Download link (#101): measured as the page loaded, reached with Tab the way a keyboard user reaches
      // it, scrolled past where a layout pins it, and loaded again with no PDF to offer.
      const links = await chrome.evaluate(downloadLinks);
      const buttons = await chrome.evaluate(footerButtons);
      for (let press = 0; press < 10; press++) {
        for (const type of ['keyDown', 'keyUp']) {
          await chrome.send('Input.dispatchKeyEvent', {
            type,
            key: 'Tab',
            code: 'Tab',
            windowsVirtualKeyCode: 9
          });
        }
        if (
          await chrome.evaluate(
            `document.activeElement === document.querySelector('[data-download-pdf]')`
          )
        )
          break;
      }
      const focus = await chrome.evaluate(focusRing);
      const afterScroll =
        !size.mobile && PINNED[layout] ? await chrome.evaluate(afterScrolling) : null;

      await chrome.send('Fetch.enable', {
        patterns: [{ urlPattern: '*/generated/manifest.json*' }]
      });
      const paused = chrome.next('Fetch.requestPaused');
      const reloaded = chrome.next('Page.loadEventFired');
      await chrome.send('Page.navigate', { url: address });
      const { requestId } = await within(paused, 30000, `${layout} never asked which PDFs exist`);
      await chrome.send('Fetch.fulfillRequest', { requestId, responseCode: 404, body: '' });
      await within(reloaded, 30000, `${layout} did not load without a PDF`);
      await within(chrome.evaluate(revealed), 30000, `${layout} did not render without a PDF`);
      const withoutPdf = await chrome.evaluate(downloadLinks);
      await chrome.send('Fetch.disable');
      const reach = downloadReach({ links, withoutPdf, afterScroll, focus, buttons }, size);

      const checks = { ...copy.checks, holdsStill: shift.holdsStill, ...reach.checks };
      const findings = {
        ...copy.findings,
        movedWhileLoading: shift.holdsStill ? [] : shift.moved,
        ...reach.findings
      };
      const passed = Object.values(checks).filter(Boolean).length;
      rows.push({
        layout,
        width: size.width,
        shift: shift.total,
        score: `${passed}/${Object.keys(checks).length}`,
        checks,
        findings,
        download: reach.measures
      });
    }
  }
} catch (error) {
  // A run that could not finish checked some layouts and not others: nothing it found is a result.
  console.error(`audit-screen: ${error.message} — nothing was checked.`);
  process.exitCode = 2;
} finally {
  await chrome?.close();
  server.closeAllConnections?.();
  server.close();
  // What is left behind is a temporary directory, not a result: say so, and let the checks stand.
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
    (error) => console.error(`audit-screen: left ${dataDir} behind — ${error.message}`)
  );
}
if (process.exitCode === 2) process.exit(2);

const failures = rows.filter((row) => Object.values(row.checks).some((value) => !value));
const report = [
  '# Screen copy matrix',
  '',
  'What a reader copies off the page: each layout opened in headless Chrome at a desktop and a phone',
  'width, its CV selected, and the selection read. Regenerate with `npm run audit:screen`.',
  '',
  '| Layout | Width | Layout shift | Score |',
  '|---|---:|---:|---:|',
  ...rows.map(
    (row) => `| ${row.layout} | ${row.width}px | ${row.shift.toFixed(3)} | ${row.score} |`
  ),
  '',
  'Checks: the CV captured whole — name, role, email and current employer; no two words the profile',
  'writes in sequence welded into one, and no contact detail run into the word beside it; every skill',
  'category followed by its own first skill; every language on a line with its level; nothing on a',
  'line the data did not write — no pictograph, no line number; and the first screen holding still',
  'while it loads — every layout shift from navigation to fonts ready, added up, below 0.1.',
  '',
  '## The Download PDF link',
  '',
  '| Layout | Width | Top copy | Heights | Label lines | Focus ring |',
  '|---|---:|---:|---:|---:|---:|',
  ...rows.map(
    ({ layout, width, download }) =>
      `| ${layout} | ${width}px | ${download.top} | ${download.heights} | ${download.lines} | ${download.ring} |`
  ),
  '',
  'Checks, the four the product review of #59 measured by hand (#101): hidden without a PDF — loaded',
  'with `generated/manifest.json` answered 404, every copy computes `display: none`; reachable — the',
  'top copy inside the first screen and, where the layout pins it, still inside the viewport and',
  'topmost after scrolling to the end; tappable — on a phone every visible copy, and the footer button',
  'beside it (#109), renders at least 43px, and the top copy 44px, ±1; and a visible focus — reached',
  'with Tab, a drawn ring that clears 3:1 against the background just outside the link, once its',
  'transitions finish. A fifth since #107: every visible copy, and the footer button beside it,',
  'renders its label on one line, at both widths. Top copy is where it spans from the top of the page;',
  'heights and label lines are every visible copy in page order, then the footer button; the ring is',
  'its contrast.'
].join('\n');

await writeReport(new URL(target.reportPath('SCREEN_AUDIT.md'), projectUrl), `${report}\n`);
console.log(report);

if (failures.length) {
  console.error('');
  console.error(
    JSON.stringify(
      failures.map(({ layout, width, checks, findings }) => ({
        layout,
        width,
        failed: Object.entries(checks)
          .filter(([, value]) => !value)
          .map(([name]) => name),
        findings: Object.fromEntries(Object.entries(findings).filter(([, found]) => found.length))
      })),
      null,
      2
    )
  );
  process.exitCode = 1;
}

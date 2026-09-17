import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer, previewKey } from './serve.mjs';
import { writeReport } from './lib/write-report.mjs';
import { findBrowser } from './lib/find-browser.mjs';
import { within } from './lib/devtools-session.mjs';
import { openBrowser } from './lib/chrome.mjs';
import { rendered, revealed } from './lib/page-ready.mjs';
import { screenCopy } from './lib/screen-copy.mjs';
import { columnOverflow, lineBreaks, pageWidth, renderedGlyphs } from './lib/line-breaks.mjs';
import { RECORD_LAYOUT_SHIFTS, layoutShift } from './lib/layout-shift.mjs';
import { downloadReach } from './lib/download-reach.mjs';
import { currentLayoutMarked, forcedBoundaries } from './lib/forced-colours.mjs';
import { decodePng } from './lib/png.mjs';
import { ringOnPixels, ringsReport } from './lib/ring-pixels.mjs';
import { GenerationTarget } from '../core/GenerationTarget.js';

/**
 * What a reader copies off the screen, checked in a browser that lays the page out.
 *
 * The unit tests read the page through JSDOM, which applies no stylesheet, so nothing in the suite can
 * see what a selection holds. `audit-print.mjs` reads the printed text layer; this reads the screen's.
 * Each layout is opened in headless Chrome at a desktop width, a tablet width and two phone widths, its CV is selected, and the
 * selection is checked against the profile (#62). The lines the CV's text is laid on are read too, since a copy has a
 * space where a line broke and cannot tell where it did (#180), and whether that text stays inside its column and the
 * page inside its viewport, since text held together cannot wrap (#198). Every control a keyboard reaches is then
 * focused in turn, and its ring read from the screen's pixels (#111).
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
// The page offers a download only for a file the build wrote, and the build's files are not committed (#149). On a
// tree nobody built, the Download link is rightly hidden and every check on it would fail a page that is right.
try {
  await readFile(new URL('generated/manifest.json', projectUrl));
} catch {
  console.error('audit-screen: generated/manifest.json is not built — nothing was checked.');
  console.error(
    'Run `npm run build:pdf` first: the Download link appears only for a PDF that exists.'
  );
  process.exit(2);
}

/**
 * A desktop, a tablet and two phones: 820px, a tablet held upright, first rendered because Nerd Mode's footer set its
 * buttons side by side there (#116) and kept when the footer went (#150); the phone most readers hold; and 320px, the
 * narrowest a page must reflow to without scrolling sideways (WCAG 1.4.10), where a label is likeliest to break (#107,
 * #111).
 */
const SIZES = [
  { width: 1280, height: 900, mobile: false },
  { width: 820, height: 1180, mobile: false },
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 844, mobile: true }
];

/**
 * Where each layout's CV begins and ends. Nerd Mode writes it into the editor; the other two lay it out
 * from the masthead to the end of the main column.
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
 * Every copy of the Download link, in page order, so a second one is counted (#150): whether it shows, how tall
 * it renders, where it spans down and across the page, so the first screen is the first screen whatever the page
 * was scrolled to, and on how many lines its label renders. The values are the browser's own, unrounded: rounding
 * is the report's, and 45.4px is not 44px ±1.
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

/** One press of Tab, the way a keyboard user moves focus. */
const pressTab = async (chrome) => {
  for (const type of ['keyDown', 'keyUp']) {
    await chrome.send('Input.dispatchKeyEvent', {
      type,
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9
    });
  }
};

/**
 * Puts where Tab starts back at the top of the page, as a page just loaded has it: a focusable point, out of the
 * flow, before everything else. The page is loaded again after the walk, so it leaves nothing behind.
 */
const startOfPage = `(() => {
  const start = document.createElement('span');
  start.tabIndex = -1;
  start.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; overflow: hidden;';
  document.body.prepend(start);
  start.focus({ preventScroll: true });
  scrollTo(0, 0);
  return true;
})()`;

/**
 * The control Tab has just focused (#111): a name for it, where it is on the page, and its outline, once it has been
 * scrolled to the middle of the screen and its transitions have finished. A ring still changing after two seconds
 * stops the run. Null when focus is on nothing a keyboard reached.
 */
const focusedControl = `(async () => {
  const control = document.activeElement;
  if (!control || control === document.body || control === document.documentElement || control.tabIndex < 0) return null;
  control.scrollIntoView({ block: 'center', inline: 'center' });
  const settled = Promise.all(control.getAnimations().map((animation) => animation.finished));
  await Promise.race([
    settled,
    new Promise((resolve, reject) =>
      setTimeout(() => reject(new Error('a focus ring was still changing after 2 seconds')), 2000)
    )
  ]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (!control.dataset.auditRing) {
    control.dataset.auditRing = String(document.querySelectorAll('[data-audit-ring]').length + 1);
  }
  const rects = [...control.getClientRects()].map((rect) => ({
    left: rect.left + scrollX,
    top: rect.top + scrollY,
    right: rect.right + scrollX,
    bottom: rect.bottom + scrollY
  }));
  const style = getComputedStyle(control);
  const name = control.getAttribute('aria-label') || control.textContent || control.getAttribute('title') || control.tagName;
  return {
    key: control.dataset.auditRing,
    name: name.trim().replace(/\\s+/g, ' ').slice(0, 60),
    rects,
    colour: style.outlineColor,
    width: parseFloat(style.outlineWidth) || 0,
    offset: parseFloat(style.outlineOffset) || 0,
    radius: parseFloat(style.borderTopLeftRadius) || 0
  };
})()`;

/** The top copy after scrolling to the end: still inside the viewport, and what a tap on its middle would hit. */
const afterScrolling = `new Promise((resolve) => {
  scrollTo(0, document.documentElement.scrollHeight);
  setTimeout(() => {
    const link = document.querySelector('[data-download-pdf]');
    const box = link.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const inViewport = box.top > -1 && box.bottom < innerHeight + 1 && box.left > -1 && box.right < innerWidth + 1;
    resolve({ inViewport, topmost: Boolean(hit && link.contains(hit)) });
  }, 300);
})`;

/**
 * The colour painted behind an element: its background and its ancestors', one over another, down to the first
 * opaque one, over the white of the page.
 */
const PAINTED = `(element) => {
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
}`;

/**
 * Every copy of the Download link as forced colours draw it: its border, once a border the forced palette adds has
 * finished its transition (#119).
 */
const forcedControls = `new Promise((resolve) => setTimeout(() => resolve(
  [...document.querySelectorAll('[data-download-pdf]')].map((control) => {
    const style = getComputedStyle(control);
    return {
      place: control.closest('footer') ? 'footer' : 'top',
      label: control.textContent.trim().replace(/\\s+/g, ' '),
      display: style.display,
      borderStyle: style.borderTopStyle,
      borderWidth: style.borderTopWidth
    };
  })
), 400))`;

/** The layout switcher's links as forced colours draw them: which is current, and what marks it besides colour (#127). */
const switcherLinks = `[...document.querySelectorAll('.layout-switcher a')].map((link) => {
  const style = getComputedStyle(link);
  return {
    label: link.textContent.trim().replace(/\\s+/g, ' '),
    current: link.getAttribute('aria-current') === 'page',
    display: style.display,
    underline: style.textDecorationLine.includes('underline'),
    borderStyle: style.borderTopStyle,
    borderWidth: style.borderTopWidth
  };
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
  const painted = ${PAINTED};
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
      // Where the lines of the same stretch of the page broke (#180): no separator at either end of one, and no
      // period split across two.
      const drawn = await chrome.evaluate(renderedGlyphs(start, end));
      if (drawn === null) throw new Error(`${layout} has no ${start} or no ${end}`);
      const breaks = lineBreaks(drawn.glyphs, profile);
      // The same glyphs against the edges of their columns, and the page against its viewport (#198): text held
      // together cannot wrap, and runs past its line when it is too wide for it. The syntax Nerd Mode's stylesheet
      // draws beside that text is held to the same columns, since it has no glyphs to judge (#207).
      const overflow = columnOverflow(drawn, await chrome.evaluate(pageWidth));

      // The Download link (#101): measured as the page loaded, reached with Tab the way a keyboard user reaches
      // it, scrolled past where a layout pins it, and loaded again with no PDF to offer.
      const links = await chrome.evaluate(downloadLinks);
      // Forced colours drop fills and shadows and keep borders: the Download link keeps a boundary there (#119).
      await chrome.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'forced-colors', value: 'active' }]
      });
      const forced = forcedBoundaries(await chrome.evaluate(forcedControls));
      const marked = currentLayoutMarked(await chrome.evaluate(switcherLinks));
      await chrome.send('Emulation.setEmulatedMedia', { features: [] });
      for (let press = 0; press < 10; press++) {
        await pressTab(chrome);
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

      // Every control a keyboard reaches (#111), in order from the top of the page, each ring read from a
      // screenshot of the pixels around it.
      await chrome.evaluate(startOfPage);
      const rings = [];
      const reached = new Set();
      for (let press = 0; press < 150; press++) {
        await pressTab(chrome);
        const control = await chrome.evaluate(focusedControl);
        if (!control || reached.has(control.key)) break;
        reached.add(control.key);
        const margin = Math.ceil(control.offset + control.width) + 8;
        const bounds = {
          left: Math.min(...control.rects.map((rect) => rect.left)),
          top: Math.min(...control.rects.map((rect) => rect.top)),
          right: Math.max(...control.rects.map((rect) => rect.right)),
          bottom: Math.max(...control.rects.map((rect) => rect.bottom))
        };
        const clip = {
          x: Math.max(0, Math.floor(bounds.left) - margin),
          y: Math.max(0, Math.floor(bounds.top) - margin),
          width: Math.ceil(bounds.right - bounds.left) + 2 * margin,
          height: Math.ceil(bounds.bottom - bounds.top) + 2 * margin,
          scale: 1
        };
        // Page coordinates, and no capture beyond the viewport: the control is on screen, and capturing beyond it
        // lays the page out again at its full height, where a sticky row and a screen-tall masthead are elsewhere.
        const shot = await chrome.send('Page.captureScreenshot', { format: 'png', clip });
        const rects = control.rects.map((rect) => ({
          left: Math.round(rect.left) - clip.x,
          top: Math.round(rect.top) - clip.y,
          right: Math.round(rect.right) - clip.x,
          bottom: Math.round(rect.bottom) - clip.y
        }));
        rings.push({
          name: control.name,
          result: ringOnPixels(decodePng(Buffer.from(shot.data, 'base64')), {
            rects,
            colour: control.colour,
            width: control.width,
            offset: control.offset,
            radius: control.radius
          })
        });
      }
      const ringCheck = ringsReport(rings);

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
      const reach = downloadReach({ links, withoutPdf, afterScroll, focus }, size);

      const checks = {
        ...copy.checks,
        ...breaks.checks,
        ...overflow.checks,
        holdsStill: shift.holdsStill,
        ...reach.checks,
        ...forced.checks,
        ...marked.checks,
        ...ringCheck.checks
      };
      const findings = {
        ...copy.findings,
        ...breaks.findings,
        ...overflow.findings,
        movedWhileLoading: shift.holdsStill ? [] : shift.moved,
        ...reach.findings,
        ...forced.findings,
        ...marked.findings,
        ...ringCheck.findings
      };
      const passed = Object.values(checks).filter(Boolean).length;
      rows.push({
        layout,
        width: size.width,
        shift: shift.total,
        score: `${passed}/${Object.keys(checks).length}`,
        checks,
        findings,
        download: { ...reach.measures, forced: forced.measures.forced },
        rings: ringCheck.measures.rings
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
  'What a reader copies off the page: each layout opened in headless Chrome at a desktop width, a tablet',
  'width and two phone widths, its CV selected, and the selection read. Regenerate with `npm run audit:screen`.',
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
  'Since #180 the lines the CV is laid on are read as well, from the box of every character the page',
  'draws, because a copy has a space where a line broke. No line starts or ends with a separator, `·`,',
  '`–`, `—` or `|`, and no period the profile writes is split across two lines; a period wider than its',
  'line may break after its dash, and only there. A failure names the text either side of the break.',
  '',
  'Since #198 the same glyphs are held to their columns, because text the page holds together cannot',
  'wrap however narrow its line: no glyph is drawn more than half a pixel past the narrowest content box',
  "around its line, its own block's or any block's it sits in, nor past the viewport, which holds even a",
  "box placed with fixed positioning; a first line's hanging indent may reach its block's own edge. The",
  'page is no more than a pixel wider than its viewport, so it does not scroll sideways. A failure names',
  "the run past the edge, the line it sits on, how far past it is, and whether the edge is its column's",
  "or the viewport's.",
  '',
  "Since #207 the syntax Nerd Mode's stylesheet draws, its quotes, commas and brackets, which have no",
  'glyphs, is held to the same columns: each line of it by the box it is drawn in, less a space the line',
  'hangs past the edge. A failure names the syntax, the line it follows and how far past the edge it is.',
  '',
  '## The Download PDF link',
  '',
  '| Layout | Width | Controls | Top copy | Heights | Label lines | Focus ring | Forced colours |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...rows.map(
    ({ layout, width, download }) =>
      `| ${layout} | ${width}px | ${download.controls} | ${download.top} | ${download.heights} | ${download.lines} | ${download.ring} | ${download.forced} |`
  ),
  '',
  'Checks, the four the product review of #59 measured by hand (#101): hidden without a PDF — loaded',
  'with `generated/manifest.json` answered 404, every copy computes `display: none`; reachable — the',
  'top copy inside the first screen and, where the layout pins it, still inside the viewport and',
  'topmost after scrolling to the end; tappable — on a phone every visible copy renders at least 43px,',
  'and the top copy 44px, ±1; and a visible focus — reached with Tab, a drawn ring that clears 3:1',
  'against the background just outside the link, once its transitions finish. A fifth since #107: every',
  'visible copy renders its label on one line, at every width. A sixth since #150: the page shows one',
  'download control, and a second visible copy fails; a page that shows none already fails as not',
  'reachable, and is not reported twice. With forced colours emulated, which drop fills and shadows and',
  "keep borders, every visible copy draws a border (#119); and the current layout's link in the switcher",
  'is told from the others there by a marker the palette keeps, an underline or a wider border (#127).',
  'Controls is how many copies show; top copy is where it spans from the top of the page; heights, label',
  "lines and forced colours are each visible copy's, in page order; the ring is its contrast.",
  '',
  '#150 removed the footer, its copy of the link and its Browser print button, and the checks that existed',
  'only for them: the secondary button drawing no shadow at rest or on hover and an outline that clears',
  "3:1 (#110, #119); the footer's button tappable beside the link (#109) and holding its label on one line",
  "(#107); the footer's copy and that button at one height (#116); and, in forced colours, the primary's",
  "border no thinner than the secondary's (#119).",
  '',
  '## Focus rings',
  '',
  '| Layout | Width | Rings |',
  '|---|---:|---|',
  ...rows.map(({ layout, width, rings }) => `| ${layout} | ${width}px | ${rings} |`),
  '',
  'Every control a keyboard reaches is focused with Tab, in order from the top of the page, and its ring read',
  'from a screenshot (#111): along its straight edges, each ring pixel against the pixel just outside the ring and',
  'the one between ring and control, or the control itself where the ring touches it. A ring under 3:1 anywhere',
  'fails, and so does one that could not be read. Rings is how many controls Tab reached, and the worst ring.'
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

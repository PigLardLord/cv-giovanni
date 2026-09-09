# Stack profile — typescript-node (vanilla ESM JavaScript, no TypeScript)

The *how* for this project. A role agent reads this alongside its own contract and conforms to
it.

> If the repo already has canonical documentation (`CLAUDE.md`, `AGENTS.md`, `docs/`), that
> wins: this file is the portable index, not a diverging copy of the rules.

The stack id says `typescript-node` because the detector matched `package.json`. **There is no
TypeScript here.** Do not add `.ts` files, a compiler or a bundler to satisfy the name.

## Language and platform

JavaScript, ES modules only, no transpiler and no build step. `package.json` declares
`"type": "module"`, and every import carries an explicit `.js` extension — the browser loads
these files as-is, so an extensionless import that Jest happens to resolve will still break the
page.

The same sources run in two places: the browser loads `index.html` → `script.js` straight from
the tree, and Node runs the tests and `scripts/*.mjs`. No `engines` field pins a version;
measured on Node 26.8.1 / npm 11.19.0.

Runtime dependencies are vendored under `vendor/` (i18next, i18next-http-backend) so the page
needs neither a CDN nor an install. `node_modules/` exists only for the test and PDF toolchain.

## Architecture and frameworks
- **UI:** no framework. Static `index.html`, imperative DOM writes from `renderers/`, styling in
  `style.css`, `layouts.css` and `print.css`.
- **Dependency injection:** constructor injection throughout, plus `core/RendererContainer.js`
  (a `Map` from section name to renderer). `script.js` is the composition root and the only
  place that names concrete classes.
- **Pattern:** ports and adapters. `domain/` holds the pure model (`CvDocument`, `PageFormat`);
  `core/` holds the application services; `interfaces/Renderer.js` and `boundaries/PdfRenderer.js`
  are the ports; `adapters/` and `renderers/` are the implementations. Renderers put data in the
  DOM — decisions belong in `core/` or `domain/`.
- **Navigation:** one page. State lives in the query string and is resolved by `LocaleResolver`
  (`?lang`), `LayoutResolver` (`?layout`) and `ProfileResolver` (`?profile`, validated against
  `^[a-z][a-z0-9-]*$` and `config/cv-manifest.json`). The locale preference persists in
  `localStorage['cv-locale']`.
- **Network / async / persistence:** no backend. `fetch` for the JSON, the i18next http backend
  for `locales/{{lng}}/{{ns}}.json`, top-level `await` in `script.js`. Persistence is static JSON
  under `profiles/` and `locales/`; PDFs are written to `generated/` by Node.

## Commands
- Build: none — the site is served as it stands. `npm run build:pdf` regenerates the PDF
  artefacts; it is a generation step, not a compile.
- Fast tests (per commit): `npm test`
- Full tests (before the change-request): `npm test && npm run verify:pdf`
- A single test: `npm test -- tests/HeaderRenderer.test.js`, or
  `npm test -- --testNamePattern="renders header information correctly"`
- Lint / static analysis: none configured. `npm run lint` and `npm run build` do not exist —
  a fresh `harness init` proposes them for any Node stack, and they must be left blank.

## Test stack

Jest 29 on the jsdom environment, ESM through `node --experimental-vm-modules`, `transform: {}`.
`jest.setup.js` only polyfills `TextEncoder`/`TextDecoder`.

Two established shapes, both already in the suite — read a sibling before writing a new one:
renderer tests build their own DOM with `new JSDOM(...)` in `beforeEach` and assert on
`document.getElementById(...)`; logic tests import the class and assert directly.

Mocking is hand-rolled by default: `tests/DataLoader.test.js` swaps `global.fetch` in
`beforeEach` and restores it in `afterEach`. Under ESM `jest.fn` needs
`import { jest } from '@jest/globals'`, which only `PdfExporter.test.js` and
`PdfGenerationService.test.js` do — reach for it when you need call assertions, not otherwise.

Fixtures are inline literals per test. The exception is `tests/LocaleCatalogs.test.js`, which
reads the real catalogs off disk and compares leaf keys `en` against `de`: that is the guard on
translations, not a unit test.

No slow-test tagging exists because none is needed — 20 files, 60 tests, about one second. Keep
it that way. One test file per renderer, named after it.

## Idioms and conventions

Screen colours, spacing and typography come from the CSS custom properties in `:root` of
`style.css`. Never write a hex or a size into a renderer or a rule; use the token.

The PDF has a separate two-part system on purpose: `adapters/LayoutThemeRegistry.js` holds one
theme per layout plus the monochrome theme, and `adapters/PdfDesignSystem.js` turns a theme into
pdfmake styles. A new PDF colour or size goes there, never inline in `PdfExporter`.

Localisation is i18next with the namespaces `ui`, `cv` and `print`, in `en` and `de`. Markup
carries `data-i18n` keys and `DocumentLocalizer` applies them. No user-visible string belongs in
JS or HTML: add the key to **both** catalogs or `LocaleCatalogs.test.js` fails. `I18nService`
appends a `?v=` cache-buster to `backend.loadPath` — bump it when the catalogs change shape.

The three layouts `nerd`, `spotlight` and `technical` are declared in three places that must
agree: `LayoutResolver`, `LayoutThemeRegistry` and `config/cv-manifest.json`.

Accessibility and ATS rules are product decisions and live in `AGENTS.md`: every rating needs a
textual equivalent, skill names stay plain text, and the reading order must survive PDF text
extraction. That file outranks this one.

JSDoc on public methods in `core/`, `interfaces/` and `renderers/`. Two-space indent, semicolons,
single quotes. `BaseRenderer.createLink` already sets `rel="noopener noreferrer"` — use it rather
than assembling an anchor by hand.

## Review pitfalls
- Business logic drifting into a renderer. `CLAUDE.md` forbids it outright.
- An import without the `.js` extension: Jest may resolve it, the browser will not.
- A new string added to `en` and not to `de` — caught by `LocaleCatalogs.test.js`, so run it.
- A new layout registered in one of the three declaration sites instead of all three.
- `RendererContainer.renderAll` catches per renderer and logs. A broken renderer therefore does
  not fail the render, and does not fail a test that only checks the page came up. Assert on the
  section's own output.
- A PDF change that keeps the tests green and breaks the artefacts: layout is only verified by
  `npm run verify:pdf`.
- A hardcoded colour or size instead of the CSS token or the PDF design system.

**Known-good — do not re-flag:**
- `vendor/i18next*` is checked in deliberately: the page must run off the file tree with no
  install step.
- Content lives only in `profiles/<profile>/<locale>.json`, behind `config/cv-manifest.json`. The
  legacy `cv-data*.json` files that used to sit at the root have been deleted.
- `tests/socialLinksRenderer.test.js` is lowercase where every sibling is PascalCase.
- Tests `import { JSDOM } from 'jsdom'` though only `jest-environment-jsdom` is declared — jsdom
  arrives transitively. It is the established pattern; raise it only when already touching
  dependencies.
- `CVApplication.handleError` writes `innerHTML` with inline styles. That is the fallback for
  when the stylesheet and the data both failed to load.
- `generated/` holds committed output, not build residue: the download link points straight at
  `generated/<file>.pdf`.
- Identifiers and comments in English; product text in `en` and `de` only.

## QA — how it is actually verified

Nothing to build or install. Serve the directory over http and open `index.html` — `file://`
fails, because the JSON is fetched. Query parameters drive every variant:
`?lang=de&layout=technical&profile=general`.

`npm run build:pdf` writes three release PDFs to `generated/` and twelve QA variants to
`generated/qa/` — three layouts × A4/LETTER × colour/monochrome. `npm run audit:pdf` then scores
each variant on eleven checks: exact page size, at most two pages, the required ATS strings
present, reading order, no raster images, a clean start to page two, measured grayscale for the
monochrome ones, canonical spelling of hyphenated compounds, block integrity in extraction, every skill
category still attached to its own list, and every web address recoverable from the text layer.
It
rewrites `docs/PDF_AUDIT.md`. Every variant must stay at 11/11.

`npm run audit:print` scores the other artefact — what the browser prints — on twelve checks,
measured on the rasterised page rather than on the stylesheet, and rewrites `docs/PRINT_AUDIT.md`.
All three layouts must stay at 12/12. It needs a browser and **exits 2 having checked nothing**
when it cannot find one, which must never be read as a pass.

`npm run audit:ats` is the third: it parses the generated PDF the way a stranger's parser would and
diffs the recovered structure against the authored one, writing `docs/ATS_AUDIT.md`. It exits 1 on
a floor — no segmentation, a lost email, a severed role, a chronology out of order — and 2 when it
could not check. Its parser is pure and blind by test: `core/AtsTextParser.js` and the lexicons may
not read the answer key.

**Platform constraint:** the audit shells out to poppler — `pdfinfo`, `pdftotext`, `pdfimages`
and `pdftoppm`. They are present on this machine under `/usr/bin`. Without them
`npm run verify:pdf` fails on a missing binary rather than on a defect, and it is the only part
of the gate that is not pure Node. Declare it in the manifest's `build.tiers` before relying on
the full gate on another machine.

Printing is a second renderer of the same data: `print.css` drives Ctrl+P and the in-page button
calls `window.print()`. Verify it separately from the pdfmake output.

## Review verdict vocabulary
Close a review with **APPROVE**, **APPROVE WITH RESERVATIONS** or **REQUEST CHANGES**, then
*Blocking* (fix before merge), *Minor* (improves quality, does not block) and *Observations*
(non-blocking notes for later).

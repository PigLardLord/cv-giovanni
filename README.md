# Giovanni Trovato — CV

The source of Giovanni Trovato's CV: a static web page in three layouts, the PDFs sent with applications, and the
audits that check both. The CV itself is at **https://piglardlord.github.io/cv-giovanni/** — nothing about the
candidate is restated here, so nothing here can go stale.

## What is here

A CV is `profile × locale × layout`.

- **The content** is one JSON file, `profiles/general/en.json`, and it is the single source of truth: every surface
  the CV has is generated from it. `config/cv-manifest.json` declares which profiles, locales and layouts exist.
- **The page** is HTML, CSS and ES modules with no build step. `index.html` loads `script.js`, which renders the
  profile through `renderers/` into one of three layouts: Nerd Mode (`nerd`), Impact Spotlight (`spotlight`) and
  Technical Profile (`technical`).
- **The PDFs** are composed from the same JSON by pdfmake, through `domain/CvDocument.js` and
  `adapters/PdfLayout.js`. The three that ship are in `generated/`, where the page's Download PDF link finds them
  through `generated/manifest.json`; the twelve A4 and Letter, colour and monochrome variants the audits read are
  built into `generated/qa/`.

The page and the PDF share the JSON and the label catalogues, not a DOM. Nothing guarantees they agree except
measuring both, which is what the audits are for.

## Running it

```bash
npm install
npm run serve
```

Then open the address it prints, with `/index.html` after it. `npm run serve` sends `no-store`, so the page is what
is on disk. Do not preview with `python -m http.server`: it sends no caching headers, and its heuristic caching has
shown this project a stale page more than once.

The server answers only this machine. `npm run serve -- --network` opens it to another device on the network,
and even then `applications/` is served to this machine alone — and only to a browser that has opened the second
address the server prints, the one ending in `?key=`. The key is new every run and never written to disk, so a proxy
or a tunnel in front of the port reaches the public CV and nothing tailored.

The URL chooses the CV:

| Parameter | Values                                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| `layout`  | `nerd`, `spotlight`, `technical`                                                         |
| `profile` | a profile the manifest declares — an unknown one fails visibly, rather than falling back |
| `lang`    | a locale the profile has; `en` today                                                     |

## Commands

| Command                | What it does                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm test`             | Jest with JSDOM: the renderers, the domain, the rules the audits apply, and the repository's own rules |
| `npm run build:pdf`    | Generates the PDFs                                                                                     |
| `npm run verify:pdf`   | Generates them, then scores every variant with `npm run audit:pdf`                                     |
| `npm run audit:print`  | Prints each layout in headless Chrome and checks the paper                                             |
| `npm run audit:ats`    | Parses the PDF the way a stranger's parser would, and reports what it recovers                         |
| `npm run audit:screen` | Opens each layout in headless Chrome and checks what a reader copies off the page                      |
| `npm run format`       | Formats the tree with Prettier; `npm run format:check` only checks it                                  |

## How it is built

Ports and adapters:

- `domain/` — the CV model and the lexicons for dates, places and section names. No framework, no I/O.
- `core/` — application services: loading and resolving the profile, the locale and the layout, exporting the PDFs
  and the cover letter, parsing and scoring what an ATS recovers. No markup, typography or colour, which
  `tests/CoreHasNoUI.test.js` enforces.
- `interfaces/` and `boundaries/` — the ports.
- `renderers/` — the page's DOM renderers, each extending `renderers/BaseRenderer.js`.
- `adapters/` — the PDF layout, its design system and themes, the cover letter's layout, Nerd Mode's Swift source
  layout, and pdfmake behind them.
- `scripts/` — generation, the audits and the development server.
- `locales/` — labels and interface strings for i18next. `vendor/` — i18next and the fonts, checked in so the page
  runs straight off the file tree.

`AGENTS.md` holds the product rules and the decisions already settled; `CLAUDE.md` is the map for coding agents.

## The audits

The two artefacts fail in different ways, so each is measured on its own, and the page twice: on paper and on screen.

- `npm run audit:pdf` scores every PDF variant: format, page count, the text an ATS looks for, reading order, no
  raster images, clean page starts, true grayscale, compounds and blocks that survive extraction, every skill still
  beside its category, every web address in the text layer. Report: `docs/PDF_AUDIT.md`.
- `npm run audit:print` scores what the browser prints, from the text layer and the pixels on the paper: contrast
  word by word, margins, the typefaces actually used. It needs Chrome — `CHROME_PATH` overrides where it looks — and
  when it finds none it exits 2 and checks nothing, because an audit that did not run must never read as a pass.
  Report: `docs/PRINT_AUDIT.md`.
- `npm run audit:ats` parses the generated PDF with no knowledge of the profile and diffs what it recovered against
  what was written. It reports Recoverability, never a pass mark. Report: `docs/ATS_AUDIT.md`.
- `npm run audit:screen` selects the CV in headless Chrome, at a desktop and a phone width, and checks what a reader
  copies: the CV whole, no two words welded together, every skill under its own category, every language with its
  level, and nothing the data did not write. Like the print audit it exits 2 when it finds no browser. Report:
  `docs/SCREEN_AUDIT.md`.

## Applications

A CV tailored to a named employer lives in `applications/`, which git ignores: this repository is public, and a
committed application would publish where the candidate applied. `npm run build:pdf -- --profile=<path>` builds
from that profile into a folder beside it, the audits take the same `--profile`, and a `letter` in the profile
adds a cover letter. A tailored CV leaves the machine only as an attached PDF.

## Working on it

Work is tracked in GitHub issues and lands through pull requests. Every push and pull request runs the gates in GitHub Actions,
`.github/workflows/gates.yml`: formatting, the tests, and the PDF, ATS and print audits. A red audit fails the build. A commit references its ticket with `Refs #N` and
never closes it — a person closes a ticket after the work has been audited, and `tests/TicketsCloseByHand.test.js`
fails on a closing keyword.

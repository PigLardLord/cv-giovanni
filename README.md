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
- **The PDFs** are the page, printed. `npm run build:pdf` serves the site to a headless Chrome and prints each
  layout through `print.css` into `generated/`, where the page's Download PDF link finds them through
  `generated/manifest.json`. Nothing there is committed: CI builds, audits and publishes its own. A cover letter is
  a page too: `letter.html`, printed beside each layout when a tailored profile carries one.

The page and the PDF share one DOM, one design and one set of words. The audits measure the printed file on paper
and as a stranger's parser reads it, and the page on screen.

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
| `npm run build:pdf`    | Prints each layout from the page in headless Chrome, into the PDFs the page offers for download        |
| `npm run verify:pdf`   | Prints them, then runs `npm run audit:print` and `npm run audit:ats` on what it printed                |
| `npm run audit:print`  | Checks the printed PDFs on paper: the text layer and the pixels                                        |
| `npm run audit:ats`    | Parses the PDF the way a stranger's parser would, and reports what it recovers                         |
| `npm run audit:screen` | Opens each layout in headless Chrome and checks what a reader copies off the page                      |
| `npm run format`       | Formats the tree with Prettier; `npm run format:check` only checks it                                  |

## How it is built

Ports and adapters:

- `domain/` — the CV model and the lexicons for dates, places and section names. No framework, no I/O.
- `core/` — application services: loading and resolving the profile, the locale and the layout, naming the PDFs,
  the cover letter's words, parsing and scoring what an ATS recovers. No markup, typography or colour, which
  `tests/CoreHasNoUI.test.js` enforces.
- `interfaces/` — the port the renderers implement.
- `renderers/` — the page's DOM renderers, each extending `renderers/BaseRenderer.js`.
- `adapters/` — Nerd Mode's Swift source layout, the local app's API routes, files, scripts and inference backends,
  and the writer the build saves its PDFs through.
- `scripts/` — generation, the audits and the development server.
- `locales/` — labels and interface strings for i18next. `vendor/` — i18next and the fonts, checked in so the page
  runs straight off the file tree.

`AGENTS.md` holds the product rules and the decisions already settled; `CLAUDE.md` is the map for coding agents.

## The audits

The PDF a recruiter downloads is the page, printed by Chrome, so the page is measured twice: on paper and on screen.
Printing needs Chrome — `CHROME_PATH` overrides where `npm run build:pdf` looks — and without one the build exits 2
and writes nothing, because a run that did not happen must never read as a pass. Nothing it writes is committed:
CI builds, audits and publishes its own.

- `npm run audit:print` reads the PDFs the build printed, from the text layer and the pixels on the paper: format,
  page count, the text an ATS looks for, reading order in both of the orders parsers read, contrast word by word,
  margins, the typefaces actually used, no Type 3 font and no image, no line of prose past 80 characters,
  Nerd Mode's dates inside their column, and reports each page's room left, warning when a last page has less than
  one line free. It exits 2 when a PDF was never built.
  Report: `docs/PRINT_AUDIT.md`.
- `npm run audit:ats` parses the generated PDF with no knowledge of the profile and diffs what it recovered against
  what was written. It reports Recoverability, never a pass mark. Report: `docs/ATS_AUDIT.md`.
- `npm run audit:screen` selects the CV in headless Chrome, at a desktop, a tablet and two phone widths, and checks
  what a reader copies: the CV whole, no two words welded together, every skill under its own category, every
  language with its level, and nothing the data did not write. It reads the lines the CV is laid on, too: none starts
  or ends with a separator, and no period is split across two, but for a period wider than its line, which may break
  after its dash. No text runs more than half a pixel past its column, and the page does not scroll sideways, since
  text held together cannot wrap. It checks that the first screen holds still while it
  loads, and that the Download PDF link, the page's one download control, does its job: hidden when there is no
  PDF, on the first screen, shown once, tall enough to tap on a phone, its label on one line, and a focus ring a
  keyboard user can see. Like the build it needs Chrome, and it exits 2 when it finds none, or when
  `npm run build:pdf` has not written the manifest that offers the download.
  Report: `docs/SCREEN_AUDIT.md`.

## Applications

A CV tailored to a named employer lives in `applications/`, which git ignores: this repository is public, and a
committed application would publish where the candidate applied. `npm run build:pdf -- --profile=<path>` builds
from that profile into a folder beside it, the audits take the same `--profile`, and a `letter` in the profile
adds a cover letter, printed from `letter.html` and checked by `npm run audit:print` too. CI never prints one, since
the published profile has none, and the site leaves `letter.html` out: published, it could only say there is no
letter. A tailored CV leaves the machine only as an attached PDF.

## The local app

`npm run serve` also answers the local app's API, the first step away from driving the pipeline from a shell. Each
endpoint hands its request to one service in `core/` and answers with what that service returns, so the browser and
the command line run the same code:

| Endpoint                               | What it does                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/profile`                     | Reads `profiles/general/en.json`                                                       |
| `PUT /api/profile`                     | Writes it, refusing a profile without the shape the renderers read, with every problem |
| `GET /api/inference`                   | Says which backend a run would use, and how it is charged, before any run              |
| `POST /api/applications`               | Creates an application: the advert, and a copy of the general profile to tailor        |
| `POST /api/applications/<name>/match`  | Runs `npm run audit:ats` with the application's profile and advert                     |
| `POST /api/applications/<name>/build`  | Runs `npm run build:pdf` with the application's profile                                |
| `POST /api/applications/<name>/tailor` | Answers 501 until the application flow is built                                        |

It answers only this machine's browser holding the run's key, as `applications/` does, and only requests from the page
the server serves. `adapters/LocalApi.js` holds the routes, and `tests/LocalApi.test.js` fails when a route does more
than pass its request through.

The app asks a model through the claude CLI when this machine has it, on whatever the CLI is signed in to, which
for a Claude subscription means no charge per run. Otherwise it uses an API key, paid per run: put the key in
`~/.config/mycv/anthropic-api-key`, or under `$XDG_CONFIG_HOME`, readable only by you. A key file other users can
read is refused, and the key is sent to the Anthropic API and nowhere else. The CLI runs with no tools, no MCP
servers and no saved session, in an empty directory of its own.

To edit the general CV without touching its JSON, open the editor address `npm run serve` prints, which carries the
run's key. `editor.html` shows the profile as a form built from the shape in `core/ProfileShape.js`, beside the CV as
the site renders it, in any of the three layouts. Saving checks the profile first and marks each problem beside its
field; a save that is written updates `profiles/general/en.json` and the preview. The editor is not published with
the site, because it can only work where the local API does.

## Working on it

Work is tracked in GitHub issues and lands through pull requests. Every push and pull request runs the gates in GitHub Actions,
`.github/workflows/gates.yml`: formatting, the tests, the PDFs printed from the page, and the print, ATS and screen audits. A red audit fails the build, and a merge to `main` is published to GitHub Pages only after every gate on it has passed. A commit references its ticket with `Refs #N` and
never closes it — a person closes a ticket after the work has been audited, and `tests/TicketsCloseByHand.test.js`
fails on a closing keyword.

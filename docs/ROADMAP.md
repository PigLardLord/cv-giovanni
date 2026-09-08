# MyCV roadmap

## Destination

MyCV generates reproducible CVs from three independent choices:

`profile × locale × layout`

The first production target is `general × en × classic-ats`. English remains
the primary content language. German will be enabled only when its complete CV
content has been reviewed; the application must never silently mix languages.

## Rules

- i18next owns UI, shared CV labels and print strings.
- ECMAScript `Intl` owns dates, numbers, lists and durations.
- Profile JSON owns editorial content and achievements.
- URL state overrides saved and browser preferences.
- Web preview and PDF use the same localized DOM.
- Unsupported combinations fail visibly instead of mixing languages.
- Every milestone ends with tests, browser review, PDF review and a small commit.

## M0 — Preserve the previous work

Status: done. The pre-localization stash has been classified and dropped, and
the stale `cv-main-preview` worktree metadata has been pruned.

What survived it:

- Inline separators, empty-section handling and the seven renderers they touch
  are on this branch, in `feat: bind inline separators and hide empty sections`.
  The separator is a real element because Chromium collapses CSS-generated
  whitespace when it lays out a page, welding adjacent items together in the PDF.
- The position-based pagination engine is on `archive/print-pagination-engine`,
  with its stress fixtures, its verification script and its plan. It is kept as
  a record rather than as working code: the two suites asserting the superseded
  `print.css` contract are excluded from that branch's Jest run.
- Diagnostics, spikes, the design board, the hidden admin panel prototype, the
  earlier profile variants and the generated PDFs were discarded.

## M1 — Standard localization foundation

Status: in progress.

- Self-host official i18next browser bundles for static deployment.
- Maintain `ui`, `cv` and `print` namespaces in English and German.
- Resolve locale from URL, saved preference, browser preference, then English.
- Localize HTML metadata, section labels, actions, accessibility and PDF DOM.
- Add a visible language switch once localized profile routing is ready.

Done when: English is regression-free, German application strings are complete,
catalog parity is tested, and both browser and PDF have been reviewed.

## M2 — Profile/locale/layout routing

- Adopt `profiles/<profile>/<locale>.json`.
- Add a manifest of supported combinations; never probe guessed filenames.
- Support shareable URLs such as
  `?profile=general&lang=en&layout=classic-ats`.
- Add accessible selectors for profile, locale and layout.
- Prevent selection of incomplete language/profile combinations.

## M3 — Recruiter-ready English general profile

- Review the English content in `profiles/general/en.json`; the stashed
  2026 variant was discarded in M0.
- Reduce the Cortado role to four or five strongest achievements.
- Keep only evidence-backed metrics.
- Simplify the technology inventory and remove rating dots.
- Keep availability/redundancy wording profile-specific and discreet.

Done when: role, seniority and evidence are clear within 20 seconds and the PDF
passes an ATS text-extraction check.

## M4 — Two production layouts

- `classic-ats`: restrained, monochrome and extraction-safe.
- `modern`: stronger hierarchy and identity without sacrificing ATS.
- Fix duplicate skill presentations before adding further designs.
- Restore and complete the position-based pagination work from
  `archive/print-pagination-engine`.

Done when: both layouts pass stress profiles and generate reviewed A4 PDFs.

## M5 — German editorial profile

- Create `profiles/general/de.json` from the approved English source.
- Review it as an idiomatic German CV, not a literal translation.
- Format dates and lists with `Intl`.
- Review German page breaks independently.

## M6 — Reliable generation and release

- Add a small local settings interface; the hidden admin panel prototype was
  discarded in M0.
- Generate deterministic filenames from profile, locale and layout.
- Add CI for tests, catalog parity, static assets and PDF smoke generation.
- Document GitHub Pages deployment and the release checklist.
- Audit the nine npm dependency findings without automatic breaking upgrades.

## Planned commit sequence

1. `build: add self-hosted i18next runtime` — complete
2. `feat: add locale resolution and translation catalogs` — complete
3. `feat: localize the CV document shell` — complete
4. `docs: add incremental MyCV delivery roadmap`
5. `feat: add localized profile routing`
6. `feat: add language and layout controls`
7. `feat: restore recruiter-ready 2026 English profile`
8. `fix: simplify and deduplicate skill presentation`
9. `feat: add ATS and modern layouts`

Generated files and unrelated changes must not be hidden inside these commits.

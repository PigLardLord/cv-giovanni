# MyCV product guidance

## Skills presentation

The skills section must give a recruiter an immediate overview without turning an unanchored self-rating into the main evidence of competence.

### Evidence reviewed

- Nielsen Norman Group explicitly identifies bars and dot ratings on resumes as arbitrary, subjective, context-free, and space-inefficient. It recommends showing where a skill was used and what it achieved: https://www.nngroup.com/articles/resumes-ux-career-changers/
- A randomized experiment with 579 German HR managers found that skill signals can affect interview invitations, but their value depends on relevance, expectedness, and credibility. This supports presenting credible signals rather than undifferentiated keyword lists: https://doi.org/10.1016/j.euroecorev.2020.103374
- Europass uses CEFR (A1-C2) and behavioral descriptors for language self-assessment. This is an appropriate standardized scale for languages: https://europass.europa.eu/en/how-self-assess-your-language-skills
- Oracle Taleo documents plain-text resume parsing. Because graphical meaning may not survive parsing, every skill and level must remain available as real text: https://docs.oracle.com/en/cloud/saas/taleo-enterprise/24c/otcug/implementing-career-section.pdf

### Product decision

- Preserve fast visual scanning and a compact, prioritized skills section.
- Dots may be offered as an optional visual reinforcement, but never as the only expression of proficiency.
- Every displayed rating must have a textual equivalent in HTML, print, PDF, accessibility output, and extracted text.
- Do not use unexplained `3/5`, percentages, or generic `beginner-to-expert` graphics. Define a small anchored scale with observable meanings, for example `Core`, `Proficient`, and `Familiar`.
- Use CEFR labels for languages; do not map language ability to generic skill dots.
- Keep the list selective and role-specific. A level should be supported by evidence in experience achievements, projects, duration, scope, or outcomes.
- Keep ATS-safe skill names as plain text and ensure the meaningful reading order survives copy/paste and PDF text extraction.
- Treat the skills visualization as a layout variant that can be compared with a compact grouped-text variant; do not claim either variant improves hiring outcomes without measured evidence.

### Acceptance criteria

- A recruiter can identify the candidate's strongest role-relevant skills in a few seconds.
- A reader can understand every level without guessing what a dot means.
- Removing CSS, icons, or graphical markers does not remove skill names or proficiency meaning.
- The CV does not claim precision that the underlying self-assessment cannot justify.

## The loop's role system

The ticket-loop skill defers to the project's own role system where one exists: *"If the project
defines its own role system (`AGENTS.md` with role cards, agents in `.claude/agents/`), that
wins."* This section is that system. It extends the per-ticket pipeline; it does not replace it.

The manifest's `agents.roster` is deliberately left empty. Nothing in the plugin reads it — not
the preflight, not `ticketctl`, not the reviewer script — so filling it would look like
configuration and do nothing. The roles below are the real ones.

### The two roles

- **`cv-reviewer`** — judges the *product*, adversarially, in seven passes. Read-only: it has no
  Write or Edit, and it reports rather than repairs.
- **`cv-composer`** — proposes layout and copy from material handed to it. It writes nothing at
  all, files included: it drafts, and someone else commits or files.

They are the product counterpart of the loop's existing code review, not a replacement for it.
A ticket can pass `codex-cli` on the diff and still ship a CV that dies in a text extractor.

### When the product review runs

Extend step 7 with a product review whenever the ticket's diff touches what the CV says or how
it renders: `profiles/`, `locales/`, `renderers/`, `index.html`, `style.css`, `layouts.css`,
`print.css`, `core/PdfExporter.js`, `adapters/PdfDesignSystem.js`, `adapters/LayoutThemeRegistry.js`.

A ticket touching only build tooling, scripts or tests does not need it — say that it was
skipped and why, rather than skipping it silently.

The review runs on the **rendered artefact**, not the diff. Run `npm run build:pdf` first;
`cv-reviewer` needs a PDF to extract text from, and a review of the source that never looked at
the output is not a product review.

### The default review target

`cv-reviewer` refuses to review without a target, by design. Unless the ticket names another:

- **Role** — the `title` field of `profiles/general/en.json`.
- **Variant** — `general × en`, the first production target in `docs/ROADMAP.md`.
- **Jurisdiction** — Germany, English-language application. Use German conventions when
  reviewing the `de` variant.

When the ticket names a different target, the ticket wins and the review says which target it
used.

### Disposition — what the verdict becomes

This is the rule that keeps the loop from either ignoring the review or drowning in it.

| Verdict finding | Disposition |
|---|---|
| **Blocking** or **Major**, inside the ticket's scope | Correct it on the open ticket, same branch, **before the merge gate**. Never open a ticket for work this branch was already meant to do. |
| **Blocking**, outside the ticket's scope | New ticket, `priority:critical`, and say so at the merge gate so the person deciding knows what is still broken. |
| **Major** or **Minor**, outside the ticket's scope | New ticket. Never widen the open branch — that is how a two-file change becomes a twelve-file review nobody reads. |
| **Minor**, inside scope | Fix it if it is cheap and covered by the existing tests; otherwise a new ticket. |
| **Observation** | Never a ticket. It goes in the change-request body. |

For a correction on the open ticket, `cv-composer` receives the finding and returns the
replacement copy or the layout parameters. The implementer applies them under TDD like any other
change, and the regression gate runs again before the review is considered answered.

### Filing the follow-up

`cv-composer` **drafts** the ticket. The lead **files** it, through
`$CLAUDE_PLUGIN_ROOT/bin/ticketctl` and never through a composed shell command — a ticket body
carrying a finding's quoted text is external input, and a `$(...)` inside it would execute.

A drafted ticket carries:

- A title naming the failure, not the fix.
- The finding verbatim: what happens, where, and the quoted evidence.
- The proposed correction, as copy or as layout parameters — never as code.
- Acceptance criteria taken from the finding's **Prevention** line, so the ticket closes against
  the rule and not against an opinion.
- The component label, and `status:backlog` unless it is being started immediately.
- No auto-closing keywords: `board.never_autoclose` is set.

Filing or reopening a ticket changes the tracker, so it sits behind the loop's ordinary
`gated` autonomy: propose the ticket, show it, and let a person say go.

### Prevention rules become tests where they can

When a finding's prevention rule is mechanically checkable, the follow-up ticket should add the
check rather than the reminder. `scripts/audit-pdfs.mjs` already scores every variant on format,
page count, required text, reading order, absence of raster images, clean page starts and
measured grayscale — an eighth check there outlives any number of review comments.

## What the browser caches, and what it does not

The stylesheets and the entry script carry a `?v=` in `index.html` and change name on
every edit. **The module graph does not**: `script.js` imports `core/` and `renderers/`
by plain relative path, and so does everything below it. Those URLs never change.

Measured on the published site, GitHub Pages serves them with `Cache-Control: max-age=600`
and an ETag. So a visitor who loaded the page in the last ten minutes can be running the
previous deploy's JavaScript; after ten minutes the browser revalidates and gets the new
file. Ten minutes of staleness on a CV is not worth a build step, an import map of twenty
generated entries, or a `?v=` inside every import — which would also put a query string in
front of Jest's resolver. The stylesheets, which carry the visible change, are versioned
already.

What *has* cost this project time, three times, is the local server. `python -m http.server`
sends no `Cache-Control` at all, so the browser falls back to heuristic freshness and can
hold a module for days: a CSS edit that appeared not to work, a "verification" that was
reading the previous build, and a renderer change that was invisible on screen while it was
plainly present in the printed PDF. Use `npm run serve` — it sends `no-store` — and do not
trust a local page served any other way.

## Known limitation — the PDF carries no structure tree

The generated PDFs report `Tagged: no`, and that is deliberate.

Assistive software navigates a PDF through a structure tree: headings, paragraphs, lists and a
declared reading order. pdfmake 0.2.20 writes the tagged *flag* — `/Marked true` — but never
builds the tree behind it: `/StructTreeRoot` comes out with no `/K` children, `/Nums []`,
`/ParentTreeNextKey 0`, and the content streams hold no marked-content sequences. `structType` on
a node changes nothing. There is no tagging API in the version's interface, README or changelog;
the strings come from the bundled pdfkit, which pdfmake does not drive.

Setting the flag anyway was tried and reverted. `Tagged: yes` over an empty tree tells a screen
reader that structure exists when none does, which is worse than an honest `Tagged: no` — the
reader stops looking. A test in `tests/PdfExporter.test.js` now fails if the flag returns without
a renderer that emits marked content.

What the document does provide: a clean text layer, no raster text, extraction order matching
visual order, real link annotations, a 9pt type floor and measured AA contrast. That is the
accessible-enough floor, not accessibility.

Closing this needs a renderer that emits tagged output, or a post-processing step that builds the
tree from the layout. Either is a separate piece of work, and the choice belongs to whoever picks
it up. Until then, do not report the PDFs as accessible.

## The PDF's design system

Settled, and not to be undone by someone reclaiming space:

- **A section rail.** Section labels sit in a 116pt left rail beside their block, not above it.
  A single-line label beside a wrapping block is the one side-by-side shape a text extractor
  handles; two blocks that both wrap interleave. The rail must therefore never be narrowed to
  the point where a label wraps — widen it before letting that happen, and remember the German
  labels are longer.
- **No letter-spacing on the labels.** At 1pt of tracking, `pdftotext` reads the gaps as spaces
  and "Professional Experience" extracts as "P ro fe s s i o n a l  E x p e r i e n c e". The
  weight of a real Bold carries the label; tracking is not needed and is not safe.
- **Inter, vendored.** `vendor/fonts/inter/` with its OFL licence, embedded and subset at
  generation. pdfmake's stock family maps `bold` to Roboto Medium 500, so a document that leans
  on weight for hierarchy could not have any. A missing font file is a hard error, never a
  silent fall back to Roboto.
- **Colour has a role or it does not ship.** Every token in the palette states what it marks and
  carries a grey equivalent, so the monochrome variant degrades rather than breaks. The previous
  palette rendered on **zero glyphs** — the inverted header forced every foreground to white and
  `nerd`'s accent was byte-identical to its muted grey — and no audit check could see it,
  because a colour that never renders breaks nothing.
- **Only the role's identity is unbreakable.** Title, employer, dates and summary travel
  together so no reader meets a bare heading; achievements flow, each individually unbreakable
  so no page opens mid-sentence. Holding the first achievement in the head too was tried and
  wasted more space than the guarantee was worth.
- **The body takes what the paper gives.** Side margins are fixed at 46pt and the measure
  follows: 377pt on A4, 394pt on LETTER. Measured on the artefact, the longest body line runs
  81 characters on A4 and 87 on LETTER, against the 80 of WCAG 1.4.8 — A4 sits at the ceiling,
  LETTER above it. That is the price of two pages at 9.3pt, and it is a deliberate trade: the
  previous layout ran to about 100. Buying the margin back means cutting content, which is the
  candidate's call.

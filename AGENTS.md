# MyCV product guidance

## The three choices, and who owns what

A CV here is `profile × locale × layout`. The first production target is `general × en × nerd`;
English is the primary content language, and German is enabled only when its CV content has been
reviewed as German rather than translated.

Ownership is strict, because every blurred line here has already produced a bug:

- **i18next** owns UI strings, shared CV labels and print strings, in `locales/<lang>/`.
- **`Intl`** owns dates, numbers, lists and durations. Never hand-format a date.
- **The profile JSON** owns editorial content and achievements, and nothing else.
- **URL state wins** over a saved preference, which wins over the browser's, which wins over
  English.
- **An unsupported combination fails visibly.** `ProfileResolver` throws rather than falling back:
  a CV that silently mixes languages is worse than one that refuses to load.

**The public CV is `profiles/`. Everything tailored to one company is `applications/`, which is
gitignored.** A CV written for a named employer names that employer, and this repository is public:
a committed application publishes who you applied to and lets any reader enumerate the rest. A
tailored version leaves the machine only as an attached PDF.
`tests/ApplicationsStayLocal.test.js` enforces it, because a rule the suite does not check is a
rule you discover by pushing.

The web page and the PDF share **the same profile JSON and the same catalogues** — not the same
DOM. The page renders through `renderers/`; the PDF is composed from the model by
`adapters/PdfLayout.js`. That is why there are two artefacts and three audits: nothing guarantees
they agree except measuring both.

These rules outlived `docs/ROADMAP.md`, which described milestones that GitHub now tracks. What
remains of that file's unfinished work is filed under the milestone _Carried over from the old
roadmap_.

## Skills presentation

The skills section must give a recruiter an immediate overview without turning an unanchored
self-rating into the main evidence of competence.

### Evidence reviewed

- Nielsen Norman Group explicitly identifies bars and dot ratings on resumes as arbitrary,
  subjective, context-free, and space-inefficient. It recommends showing where a skill was used
  and what it achieved: https://www.nngroup.com/articles/resumes-ux-career-changers/
- A randomized experiment with 579 German HR managers found that skill signals can affect
  interview invitations, but their value depends on relevance, expectedness, and credibility. This
  supports presenting credible signals rather than undifferentiated keyword lists:
  https://doi.org/10.1016/j.euroecorev.2020.103374
- Europass uses CEFR (A1-C2) and behavioral descriptors for language self-assessment. This is an
  appropriate standardized scale for languages:
  https://europass.europa.eu/en/how-self-assess-your-language-skills
- Oracle Taleo documents plain-text resume parsing. Because graphical meaning may not survive
  parsing, every skill and level must remain available as real text:
  https://docs.oracle.com/en/cloud/saas/taleo-enterprise/24c/otcug/implementing-career-section.pdf

### Product decision

- Preserve fast visual scanning and a compact, prioritized skills section.
- Dots may be offered as an optional visual reinforcement, but never as the only expression of
  proficiency.
- Every displayed rating must have a textual equivalent in HTML, print, PDF, accessibility output,
  and extracted text.
- Do not use unexplained `3/5`, percentages, or generic `beginner-to-expert` graphics. Define a
  small anchored scale with observable meanings, for example `Core`, `Proficient`, and `Familiar`.
- Use CEFR labels for languages; do not map language ability to generic skill dots.
- Keep the list selective and role-specific. A level should be supported by evidence in experience
  achievements, projects, duration, scope, or outcomes.
- Keep ATS-safe skill names as plain text and ensure the meaningful reading order survives
  copy/paste and PDF text extraction.
- Treat the skills visualization as a layout variant that can be compared with a compact
  grouped-text variant; do not claim either variant improves hiring outcomes without measured
  evidence.

### Acceptance criteria

- A recruiter can identify the candidate's strongest role-relevant skills in a few seconds.
- A reader can understand every level without guessing what a dot means.
- Removing CSS, icons, or graphical markers does not remove skill names or proficiency meaning.
- The CV does not claim precision that the underlying self-assessment cannot justify.

## Qualifications and certifications

- **A foreign qualification uses the issuer's wording,** never a German- or English-style abbreviation
  the issuer does not award. The programme at the University of Pisa is a _First Level Professional
  Master's Programme in Mobile Applications Development_, and an abbreviated degree in its place claims
  one nobody conferred. When the name holds a word the target market reads as a degree level —
  _Master's_ — the rendered text states its scope (#48).
- **A certification's name is the title on the page its link opens.** Lower tiers it includes go in
  brackets after it — `Android Enterprise Expert (incl. Associate, Professional)` — never as equal names
  in one entry, which reads as a credential nobody issues.
- **A certification may lose its description only if its name line still states the subject.** Page
  budget took the description of iOS Lead Essentials; its subject moved into brackets on the name line,
  `iOS Lead Essentials (TDD, Clean Architecture)`, rather than disappearing.

## The loop's role system

The ticket-loop skill defers to the project's own role system where one exists: _"If the project
defines its own role system (`AGENTS.md` with role cards, agents in `.claude/agents/`), that
wins."_ This section is that system. It extends the per-ticket pipeline; it does not replace it.

The manifest's `agents.roster` is deliberately left empty. Nothing in the plugin reads it — not
the preflight, not `ticketctl`, not the reviewer script — so filling it would look like
configuration and do nothing. The roles below are the real ones.

### The two roles

- **`cv-reviewer`** — judges the _product_, adversarially, in seven passes. Read-only: it has no
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

### Linked pages are part of the CV

`profiles/<profile>/<locale>.json` is the single source of truth. The web CV and the PDFs are built
from it, and a copy of the CV kept by hand anywhere else is stale by construction. So the CV links only
to surfaces built from the profile, and to third-party profiles that are not a second copy of it —
GitHub, LinkedIn. A second copy is not kept in step; it is unlinked. The Google Sites page that still
claimed the withdrawn degree was unlinked on #47 rather than corrected, and a blog there can be linked
once it is a blog.

When a ticket corrects a factual claim — a degree, a date, a level, a number of years — the product
review checks every third-party page the CV links to for the old wording before the merge, and the pull
request says what it found. That check is by hand: LinkedIn and XING need a login.

Inside the repository the check is not by hand. `tests/WithdrawnClaimsStayWithdrawn.test.js` lists every
withdrawn claim with its reason and fails on any tracked file that still makes one, so withdrawing a
claim means adding it there. `tests/ReferenceFixtureFollowsProfile.test.js` holds the recoverability
tests' reference fixture to the profile: it drifted once while every test built on it kept passing.

### The default review target

`cv-reviewer` refuses to review without a target, by design. Unless the ticket names another:

- **Role** — the `title` field of `profiles/general/en.json`.
- **Variant** — `general × en`, the first production target named above.
- **Jurisdiction** — Germany, English-language application. Use German conventions when
  reviewing the `de` variant.

When the ticket names a different target, the ticket wins and the review says which target it
used.

### Disposition — what the verdict becomes

This is the rule that keeps the loop from either ignoring the review or drowning in it.

| Verdict finding                                      | Disposition                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Blocking** or **Major**, inside the ticket's scope | Correct it on the open ticket, same branch, **before the merge gate**. Never open a ticket for work this branch was already meant to do. |
| **Blocking**, outside the ticket's scope             | New ticket, `priority:critical`, and say so at the merge gate so the person deciding knows what is still broken.                         |
| **Major** or **Minor**, outside the ticket's scope   | New ticket. Never widen the open branch — that is how a two-file change becomes a twelve-file review nobody reads.                       |
| **Minor**, inside scope                              | Fix it if it is cheap and covered by the existing tests; otherwise a new ticket.                                                         |
| **Observation**                                      | Never a ticket. It goes in the change-request body.                                                                                      |

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
- No auto-closing keywords, here or anywhere else — see **Who closes a ticket** below.

Filing or reopening a ticket changes the tracker, so it sits behind the loop's ordinary
`gated` autonomy: propose the ticket, show it, and let a person say go.

### A problem you found is a ticket, not a sentence

Whatever you were doing when you found it. This is the rule the disposition table above already
implies and that this project kept breaking: six real defects — unrendered career figures, a
measure past the WCAG ceiling, a hardcoded name in the naming rule, a section bypassing the
domain model, a letter dated from a full address, and a board setting every commit contradicts —
were each found, stated in a chat message, and lost when the session ended. They are issues 32 to
38 now, and they should have been issues the day they were seen.

So:

- **File it when you find it**, before deciding whether it is worth doing. Filing costs a minute
  and is reversible; a finding that lives in a message is gone.
- **Do not widen the branch to fix it.** The disposition table decides: in scope and cheap, fix it
  here; anything else is a new ticket. A two-file change that becomes twelve is a change nobody
  reviews.
- **Write what happens, where, and quoted** — the same bar the reviewer is held to. A ticket
  without evidence is an opinion with a number.
- **Say what you did wrong, when it was yours.** Half of 32–38 came from this loop's own work.
  A ticket that hides its origin is a ticket somebody re-litigates.

The finished work is then judged by an **external auditor**, not by the loop that produced it.
That is the point of filing rather than fixing quietly: an auditor can read a ticket and a diff,
and cannot read a message that was never written down.

### Who closes a ticket

A person does, after the work has been audited. Never a merge.

`board.never_autoclose` in `.agents/harness/ticket-loop.json` says so. It arrived as the harness
template's default rather than as anyone's decision, and for three sprints the practice
contradicted it: every commit message ended `Closes #N` and both pull-request bodies repeated the
list. Thirteen tickets closed themselves the moment pull request #1 merged, still carrying
`status:in-review` — a label saying a review was pending on work the tracker had already filed
away. That is issue #37, and the flag is now a decision rather than an inheritance.

The rule, in full:

- **A commit message references a ticket, it does not close one.** Write `Refs #19`. The keywords
  GitHub acts on are `close`, `fix` and `resolve`, in all three tenses, followed by `#N` or the
  issue's URL — all nine are forbidden, and `tests/TicketsCloseByHand.test.js` fails on any commit
  a branch adds to the base branch that uses one.
- **A pull-request body follows the same rule.** It is merged into the default branch's history
  and GitHub reads it there too.
- **Closing is the auditor's act.** An auditor reads an open ticket against a diff. A ticket a
  merge closed on its own was read by nobody, and reopening it afterwards leaves a timeline that
  says the work was done twice.

The one exemption was written down where it applied. Six commits merged through pull request #31
carried closing keywords for tickets 15 to 20, and rewriting them would have orphaned the SHAs that
pull request points at, so the test listed them by SHA with the reason. They closed those six
tickets when #41 merged on 2026-09-10, as #40 said they would, and each was reopened with a note
naming the commit that closed it. Once all six were on `main` the list exempted nothing and was
removed: an exemption that can be counted beats one that lives in a habit, and one that exempts
nothing is noise.

### Prevention rules become tests where they can

When a finding's prevention rule is mechanically checkable, the follow-up ticket should add the
check rather than the reminder. `scripts/audit-pdfs.mjs` already scores every variant on format,
page count, required text, reading order, absence of raster images, clean page starts and
measured grayscale — an eighth check there outlives any number of review comments.

There are **two artefacts and three audits**, and they fail differently. `npm run audit:pdf` scores
the documents pdfmake builds. `npm run audit:print` scores what the browser prints: it serves the
site, prints each layout with a headless Chrome, and reads the text layer poppler extracts and the
pixels that reached the paper — contrast per word against the printed page, ink margins per page,
every skill still attached to its category, nothing in the text layer the data did not write. A
CV can pass every check in the first and still print a line of white on white, which is exactly
what it did. Run both before claiming the document is sound.

The third asks a different question altogether. `npm run audit:ats` parses the generated PDF the
way a stranger's parser would — no `-layout`, no access to `profiles/`, no knowledge of what the
document was supposed to say — and diffs the structure it recovered against the structure that was
authored. The other two ask _did my string survive_; this one asks _in the right slot, beside the
right neighbours, in the right order_, which is the question a recruiter's search puts to a parsed
record. It reports **Recoverability**, never a score: the weights are in `core/AtsScore.js` with
the reason for each, the report prints them, and it says plainly that no vendor produces the
number and no employer will ever see it. The score gates nothing; four floors do — a document that
did not segment, a lost email, a role severed from its title or period, and a chronology that does
not run one way.

`audit:print` needs a Chrome or Chromium binary. It looks for one on PATH, in the usual install
locations and in the Playwright cache; `CHROME_PATH` overrides. When it finds none it **exits 2
and checks nothing**, because an audit that did not run must never read as a pass — the same
mistake the grayscale check made when its filename pattern matched no files for weeks.

## Branches, and how a change reaches the public CV

**GitHub Flow**, chosen by the owner on #44:

- **`main` is what is published.** GitHub Pages serves it: a commit on `main` is a commit a recruiter
  can open.
- **Every change reaches `main` by pull request,** from a short-lived branch cut from `main` and named
  `{prefix}/{ticket}-{slug}`, as the ticket loop already names it, and merges once the gates in
  `.github/workflows/gates.yml` are green.
- **No other branch lives long.** No `develop`, no `release/*`, no integration branch. `cv-2026-update`
  lived for months: pull request #31 merged into it twenty-one seconds after it had been merged into
  `main`, and sprint 3 never reached the default branch (#40). A release, when one is worth naming, is a
  tag on `main`.
- **An urgent fix takes the same road:** a branch from `main`, a pull request, the gates, a merge. A
  second road to the public CV would be a road without gates, and #63 is what that costs: a merge nobody
  tested published an empty CV for 48 minutes.
- **`.agents/harness/guards.json` protects `^main$`**, and nothing else, so the local hook refuses a
  direct commit to `main`. The same rule on GitHub — a ruleset requiring a pull request and the gates —
  is a repository setting, and the owner's to switch on. `tests/BranchingModel.test.js` fails when the
  guard and this section stop agreeing.

A merge to `main` is what publishes. `.github/workflows/gates.yml` runs every gate on that commit and
only then deploys it to GitHub Pages: the tree as committed, with the PDFs that run built from the
committed profile and audited. A red gate publishes nothing. The Pages source is that workflow, not the
branch, so the legacy build that published every push to `main` on its own is gone, and with it the
road #63 took (#45).

One branch predates the model and stays: `archive/print-pagination-engine` keeps the print pagination
engine that was removed reachable. It is never merged and never deployed.

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

What _has_ cost this project time, three times, is the local server. `python -m http.server`
sends no `Cache-Control` at all, so the browser falls back to heuristic freshness and can
hold a module for days: a CSS edit that appeared not to work, a "verification" that was
reading the previous build, and a renderer change that was invisible on screen while it was
plainly present in the printed PDF. Use `npm run serve` — it sends `no-store` — and do not
trust a local page served any other way.

## Formatting belongs to Prettier

Nobody lays code out by hand here. Prettier does, for every file type it understands, and
`npm test` fails on a file it would change.

This was decided after the review on pull request #41 found ten indentation defects in ten files by
eye — a bare block left behind by an edit, a loop header wrapped to the depth of its body, a
property aligned with the wrong object — and #42 found that nothing in the repository could have
caught them. An indentation test would have policed one rule; a formatter removes the decision.

- **Prettier 3.9.6, pinned exactly.** A floating version would reformat the tree on a minor release,
  in a commit nobody meant to make.
- **The configuration is the style the code already had,** not Prettier's defaults: two spaces,
  single quotes, no trailing commas, 100 columns. `proseWrap` is `preserve`, so Markdown keeps its
  line breaks.
- **`.prettierignore` says what is not formatted, and why:** vendored code and the lockfile, the
  files the scripts write (`generated/` and the three audit reports), the harness's own files, and
  test fixtures whose exact bytes are what the tests check.
- **`.editorconfig`** carries the same indentation to editors that do not run Prettier.
- **`npm run format`** writes, **`npm run format:check`** checks, and
  `tests/SourceIsFormatted.test.js` runs the check inside the suite — and proves it can fail on a
  mis-indented file.

The adoption reformatted 86 files and changed nothing else, which was measured rather than assumed:
identical syntax trees for every JavaScript file, identical JSON values and Markdown words,
pixel-identical screen and print renders of all three layouts, and identical PDF text and audit
reports built from the committed profile. That commit is listed in `.git-blame-ignore-revs`, so
`git blame` shows who wrote a line rather than who ran the formatter; locally that takes
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Known limitation — the PDF carries no structure tree

The generated PDFs report `Tagged: no`, and that is deliberate.

Assistive software navigates a PDF through a structure tree: headings, paragraphs, lists and a
declared reading order. pdfmake 0.2.20 writes the tagged _flag_ — `/Marked true` — but never
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
  and "Professional Experience" extracts as "P ro fe s s i o n a l E x p e r i e n c e". The
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

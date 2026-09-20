# MyCV product guidance

## The three choices, and who owns what

A CV here is `profile × locale × layout`. The first production target is `general × en × nerd`;
English is the primary content language, and German is enabled only when its CV content has been
reviewed as German rather than translated.

Ownership is strict, because every blurred line here has already produced a bug:

- **i18next** owns UI strings and shared CV labels, in `locales/<lang>/`. The print has no strings
  of its own, since it is the page printed (#144), and a catalogue holds only what the code reads (#190).
- **`Intl`** owns dates, numbers, lists and durations. Never hand-format a date.
- **The profile JSON** owns editorial content and achievements, and nothing else. A profile that
  ships dates every degree, gives every certification its issuer and the year of its current
  validity, and gives every role a location or none. The shape leaves those fields optional, so
  the editor saves a profile without them and the page prints it without stray punctuation; but
  an undated degree is lost to a parser reading in drawing order, a certificate without a year
  cannot be told current from lapsed, one without an issuer names nobody who awarded it, and one
  role without a place reads unlike neighbours that name theirs. So `npm run build:pdf` warns about
  each one left out and still writes the PDFs (`core/ProfileCompleteness.js`), and
  `npm run audit:print` fails a page that prints what an empty field leaves behind: `()`,
  `undefined`, a header ending on its separator (#178).
- **URL state wins** over a saved preference, which wins over the browser's, which wins over
  English.
- **An unsupported combination fails visibly, when someone asked for it.** A `?lang=` or `?profile=` the
  manifest does not publish makes `ProfileResolver` throw rather than fall back: a CV that silently mixes
  languages is worse than one that refuses to load. A saved preference or a browser's language is only a
  guess, and a guess is taken from the languages the profile publishes: a German browser opening an
  English-only CV gets the English CV, never an error (#103).

**The public CV is `profiles/`. Everything tailored to one company is `applications/`, which is
gitignored.** A CV written for a named employer names that employer, and this repository is public:
a committed application publishes who you applied to and lets any reader enumerate the rest. A
tailored version leaves the machine only as an attached PDF.
`tests/ApplicationsStayLocal.test.js` enforces it, because a rule the suite does not check is a
rule you discover by pushing.

**The PDF a recruiter downloads is the page, printed.** `npm run build:pdf` serves the site to a
headless Chrome and prints each layout through `print.css`, so the page and the PDF share one DOM,
one design and one set of words. They used to be two artefacts: the page through `renderers/`, and a
PDF pdfmake composed from the model in a design of its own. They drifted — the PDF carried career
highlights and an as-of month the page never showed (#148) — and the owner chose one CV over two
(#144). A cover letter is a page too, `letter.html`, printed the same way (#151), and pdfmake was
removed once it had no document left to write (#153).

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
  one nobody conferred.
- **A qualification whose name contains a word the target market reads as a degree level states its
  scope, in credits or duration** (#48). A German reader hears _Master_ as the Bologna second cycle,
  typically 120 ECTS on top of a bachelor's, and assumes that scope when the line states none; the
  correction then arrives at the certificate check. The scope follows the degree's name, in brackets
  and set as the period is: a degree's `credits`, a whole number taken from its certificate, in the
  catalogue's words — `education.credits`, `{{count}} ECTS` in English and in German — with `Intl`
  writing the number, and in Nerd Mode as the string `credits: "60 ECTS"`, never a bare number. It
  costs no printed line: _First Level Professional Master's Programme in Mobile Applications
  Development (60 ECTS)_.
- **The school's line is left as it is: `School (period)`,** with `period` the dates alone. The ATS
  parser reads a line as a degree's school and period only when its last segment, or a parenthesis
  closing it, reads as a period, so a scope written after the period (`School (2014 – 2016) · 60 ECTS`)
  gave main's parser a wrong school and no period for that degree, and in content-stream order one
  record for both degrees, as the product review on #179 measured. After the name, main's parser
  recovers every degree, school and period in every reading order, and keeps the scope in the degree.
  The ATS audit compares a degree as the document prints it, scope included: a parser that returns the
  printed line lost nothing, so the scope costs nothing, and a degree recovered without it, or cut
  short, is graded partial (#186). The print audit's "degree beside its school" expects exactly the
  scope between the two (`scripts/lib/degree-lines.mjs`). The wording is the candidate's call.
- **A scope qualifier uses credits** — and, if ever, the issuer's legal title — **never a label that is
  itself a degree type in the target market:** no _continuing-education master_, no _postgraduate
  diploma_, each of which names a qualification of its own to a German reader.
  `tests/QualificationsStateTheirScope.test.js` holds every published degree named a Master's to
  stating its credits.
- **A certification's name is the title on the page its link opens.** Lower tiers it includes go in
  brackets after it — `Android Enterprise Expert (Associate, Professional)` — never as equal names
  in one entry, which reads as a credential nobody issues. The brackets hold the tiers and no word
  before them: the line prints as `name – issuer (year)`, a parser reads one line as one
  certification, and the longest line Nerd Mode's text column takes is 68 characters, where
  "(incl. Associate, Professional)" wrapped and "(2026)" came back as a certification nobody wrote
  (#230).
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
it renders: `profiles/`, `locales/`, `renderers/`, `domain/EntryLines.js` (the lines they write),
`adapters/SwiftSourceLayout.js` (Nerd Mode's source view), `script.js` (what the page renders),
`core/I18nService.js` and `core/DocumentLocalizer.js` (every label it prints), `index.html`,
`style.css`, `layouts.css`, `design-glacier.css`, `print.css` (the PDF is the page printed through
it), `scripts/generate-pdfs.mjs`, `scripts/lib/printed-cv.mjs`, `scripts/lib/print-page.mjs` and
`scripts/lib/page-ready.mjs` (the pipeline Chrome prints it through, #144, #149), `vendor/fonts/`,
`core/CvFiles.js` (the name the recruiter's inbox receives), and the cover letter's `letter.html`,
`letter.css`, `core/LetterContent.js` and `renderers/LetterRenderer.js` (#151).

`npm run audit:ats:base` reads that list, so a path added to it is one the base branch's parser is
asked about too (#181): keep it one paragraph, directly under this heading.

A ticket touching only build tooling, the other scripts or tests does not need it — say that it
was skipped and why, rather than skipping it silently.

The review runs on the **rendered artefact**, not the diff. Run `npm run build:pdf` first;
`cv-reviewer` needs a PDF to extract text from, and a review of the source that never looked at
the output is not a product review.

The product reviews of #59 and #107 asked for five more rules. The product review checks them, by hand
where the screen audit cannot:

- **Anything added above the masthead comes with a measured list of what leaves the first screen**,
  at 390×844 and at 1280×720. Whatever goes above the name pushes the rest of the first screen down,
  and the pull request says what it pushed out.
- **A glyph that `aria-hidden` hides is not moved into generated content.** A `::before` or `::after`
  joins the control's accessible name, so a screen reader would read the icon as part of the label.
- **A row of buttons that would break a label on a narrow screen stacks rather than squeezes**,
  primary first and in the page's order, each with a minimum height and never a fixed one. Cutting
  the padding holds one language at one width: #107 measured the footer's row 4px short at 320px in
  English, before any longer label.
- **A modifier class comes after the rule it modifies, or is more specific; otherwise the base wins every
  property both declare.** `.print-button-secondary`, the footer's Browser print until #150, sat above
  `.print-button` at the same specificity, so the base's `border: none` and shadow won. An override that sets
  part of a shorthand, such as `border-color`, sets the whole shorthand unless it is certain which rule supplies
  the rest: the skins set `border-color`, and it drew nothing (#110).
- **The lesser of two paired actions carries no shadow, at rest or on hover.** Fill and shadow mark the
  primary. The secondary may share its hue in its outline and its label, never its fill or its shadow (#110).
- **A focus ring takes the tone its surface cannot swallow, never a bright one.** Deep on a light surface,
  white on a dark one such as Spotlight's ember masthead. It is an outline, never a shadow, which forced
  colours drop. And it is drawn whole: a focusable control stands at least the ring's offset and width, plus
  3px, from the next one, so its ring meets the surface and not the next control's fill; where controls touch,
  as in Nerd Mode's segmented switcher, the focused one is raised above its neighbours (#121).
- **A button that shares a row with a link sets its own `line-height` in the skin.** A `<button>` takes the
  browser's `font` shorthand, which resets the line height a link inherits, so the two render different heights
  side by side: 32px against 35px in Nerd Mode's footer, before #150 removed it (#116).
- **A control marked as a button by its fill and shadow keeps a border in forced colours.** A contrast theme
  drops both and keeps border styles, so such a control shows as bare text while an outlined lesser action
  beside it still reads as a button. There the primary's border is at least as wide as the secondary's (#119).
- **In forced colours, a state marked only by colour takes a marker the palette keeps.** The current layout's
  link in the switcher is underlined there, 3px thick, since its fill is replaced like every other link's (#127).
  An underline already marks a link elsewhere on the page, and the reuse is deliberate: the switcher's other links
  carry none, so the mark only has to set one link apart from its neighbours, as a tab's indicator does. A later
  state that needs a marker should say which one it takes and what else already uses it.

What that review measured on the Download link itself — hidden without a PDF, reachable, tappable,
a visible focus ring — `npm run audit:screen` checks on every render (#101), and since #107 that its label
holds one line. Since #111 it focuses every control a keyboard reaches, at 320px too, and reads each ring
from the screen's pixels: a ring clears 3:1 against what lies just outside it and against what it
surrounds, or the render fails. Since #116 it renders a tablet width, 820px. Since #119 it emulates forced
colours and holds the Download link to a border there. Since #127 it holds the current layout's link to a
marker there that is not a colour, and fails a current link that is not shown. Since #150 the page offers
one download control, the link at the top, and a second copy that shows fails the render; a page that
shows none already fails as unreachable.

#150 removed the footer, with its copy of the link and Browser print, and the checks that existed only for
them went too: that the secondary button carried no shadow and an outline clearing 3:1, at rest and with
`:hover` forced (#110, #119); the footer button's tap height (#109) and its label on one line (#107); the footer's copy and
that button at one height (#116); and, in forced colours, the primary's border no thinner than the
secondary's (#119). The rules above that came from them stay, for the next pair of actions.

A copy of the page has a space where a line broke, so no check on the copy can tell where one did: the product
review of #179 measured a degree's period broken as "Università degli Studi di Pisa (2014" / "– 2016)" at Impact
Spotlight's 1280px while the selection read it whole. Since #180 `npm run audit:screen` also reads the lines the CV
is laid on, from the box of every character the page draws, in the same stretch of the page the copy is selected
from: no line starts or ends with a separator, `·`, `–`, `—`, `|` or `→`, and no period the profile writes is split across
two lines. A period wider than its line cannot keep to one, and there the least bad break is after its dash, which
tells the reader the range goes on: it may break there and nowhere else. A failure names the layout, the width and
the text either side of the break. The page holds each end of a role's period, and each separator with its spaces,
in a `.no-break` span, as it holds a hyphenated compound; a degree's period and a period in Nerd Mode's editor are
held whole; and a certificate's link ends in an empty box that never wraps, because Chrome breaks a line where the
link and the name inside it close, even before a held separator. Held text cannot wrap however narrow its line, so
since #198 the audit also fails a glyph drawn more than half a pixel past the viewport or past the narrowest content
box around its line (a first line may hang its indent as far as its block's own edge), or a page more than a pixel
wider than its viewport, and names the run past the edge, its line, how far, and whose edge it passed. Since #207 it
holds the syntax Nerd Mode's stylesheet draws to the same columns, by the box each line of it is drawn in, less a
space the line hangs past the edge, and names the line the syntax follows. Because the editor's lines may break
anywhere, since #219 the audit also fails a row the editor wraps a line onto that opens with syntax closing the row
above it, a lone `",` or `),`, or with that syntax after nothing but escapes and punctuation, as `\""`, and names the
line it closes. `SwiftSourceLayout` decides what the syntax holds, from the value whole: the last letter or digit of a
last word a space precedes, so a word too long for a row breaks inside, and otherwise the whole last word; the renderer
only applies the marks. A period too wide for a row with its quotes and comma breaks after its dash, the syntax counted
in its width.

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
check rather than the reminder. `scripts/audit-print.mjs` already scores every printed layout on
format, page count, required text, reading order in both of the orders a parser reads, contrast on
the paper, margins, typefaces, Type 3 fonts and images, and every printed cover letter on checks of
its own — an eighteenth check there outlives any number of review comments.

**One CV and three audits**, and they fail differently. `npm run audit:print` reads the PDFs
`npm run build:pdf` printed — the files CI publishes, never a copy printed for the audit, which would
pass whatever the generator wrote — through the text layer poppler extracts and the pixels that
reached the paper: contrast per word against the printed page, ink margins per page, every skill
still attached to its category, nothing in the text layer the data did not write, and, read in the
order the PDF draws it, every name spaced and every section in its place. No line of prose, the
summary, the highlights and what a role, a certificate or a degree says, runs past WCAG 1.4.8's 80
characters; a line of skills, interests or contacts is a list, scanned item by item, and is exempt.
In Nerd Mode no line of a role's dates runs out of its 128pt column (#155). Every bullet is set over
no more than two printed lines and the summary over no more than three, and every role prints whole on
one page, so no page opens on a bullet whose role heading stands on the page before (#230): what a
sentence costs on paper is not what it costs in the profile, and the same words wrap differently in
each layout. It also reports how much
room each page has left above its foot, and marks a last page with less than one line of running
text free, as a warning and never a failure: the page count is the gate, and the warning is the
notice that it is close (#162). A check on the stylesheet passed a page that printed a line of
white on white. `npm run audit:screen` reads what a reader
copies off the screen, and the page's controls. `npm run verify:pdf` builds, then runs the print and
ATS audits: run it before claiming the document is sound.

**The CV is spelled in its locale, offline.** `tests/CvIsSpelledRight.test.js` reads every published
profile and every catalogue of its locale (the labels and the page's words) against a
pinned dictionary, British English for `en`, and names each unknown word with its JSON path.
Spelling errors are the best-measured penalty in CV screening: five cut the probability of an
interview invitation by 18.5 percentage points, two by 7.3 (Sterkens et al., PLOS ONE 2023, 445
recruiters) (#152). A product, a place or a surname the dictionary does not know is allowed by name
in `config/spelling/<locale>.txt`, sorted, one term a line, never by a rule broad enough to let a
misspelling through with it. A locale with no dictionary fails rather than passing unchecked, so a
German CV needs one before it is published.

The ATS audit asks a different question altogether. `npm run audit:ats` parses the generated PDF the
way a stranger's parser would — no `-layout`, no access to `profiles/`, no knowledge of what the
document was supposed to say — and diffs the structure it recovered against the structure that was
authored. The print audit asks _did my string survive_; this one asks _in the right slot, beside the
right neighbours, in the right order_, which is the question a recruiter's search puts to a parsed
record. It reports **Recoverability**, never a score: the weights are in `core/AtsScore.js` with
the reason for each, the report prints them, and it says plainly that no vendor produces the
number and no employer will ever see it. The number is printed as computed, a fraction cut to one
decimal and never rounded, and every field graded partial, wrong or lost is listed with what was
written beside what came back: rounded, a degree graded partial read 80/80, and the report named
nothing (#186). An entry that came back is matched to the one written by what it says, not by where
it stands: a role by its title and employer, a degree by its name and school, their dates only
breaking a tie between two those match equally, a category by its label, a language by its name, a
certification by its line. An entry that prints a written one's dates and nothing else of it matches
none: taken for that entry, a role nobody wrote read its period and achievements as recovered and
was never counted as invented. Matched by position, a parser that dropped the first of three degrees
graded the other two against their neighbours, and one loss read as three. The order the roles came
back in is judged by the chronology alone, and an entry that matches none written is listed as one
nobody wrote, which costs only when it is a role (#217). The score gates nothing; four floors do — a
document that did not segment, a lost email, a role severed from its title or period, and a
chronology that does not run one way. The floors are checked in two reading orders: poppler's, which
the score is computed on, and the content stream's (`pdftotext -raw`), which PDFBox and Tika read by
default. They fail differently: on the two-column browser print, poppler's order kept the contacts
above the career, while the content stream drew the skills first and the name after the first role,
and lost the email (#147).

**A parser change and a layout change are reviewed apart,** or the pull request shows what the base
branch's parser recovers from the new print. `audit:ats` grades the print with the branch's own
parser, so a change to both can pass because the grader moved: #179 first added " · 60 ECTS" after
the Pisa school line and widened the parser to read it, and 80/80 held while `main`'s parser read
the school as "Development", gave it no period, and in content-stream order merged both degrees into
one (#181). CI holds every pull request to it with `npm run audit:ats:base`. The step applies when
the change touches the parser — `core/AtsTextParser.js` and every module it imports, read from the
imports — and what renders the CV — the paths the product review runs on, read from that paragraph
above, and every module the page's entry script, the renderers and the print pipeline import
(#202). A parser module only the pipeline reaches does not count: the pipeline prints the cover
letter, whose place line reads the parser's `PlaceLexicon`, and counted, a change to the parser
alone would apply. It builds the base's print in a temporary worktree, reads that print and the
new one with the base's parser in the three orders `audit:ats` reads, and fails on a field the
base's parser recovered from the base's print and recovers less of from the new one. Each print is
graded by the branch that printed it: against its own profile, by its own `RecoveryDiff`, and so
by its own `EntryLines` and catalogue, the base's imported apart from the branch's. Graded by the
branch's alone, a change that rewords a line held the base's print to the new words, and a loss
read "partial → partial" (#201). A field the base's grader does not grade, such as a degree's
period before #200, is listed as not graded on the base, and is not a loss. An entry of the base's
profile is compared with the entry of the branch's that says the same, by the rule the diff matches
a recovered entry by (#217), on what each branch's grader says its print writes, and a loss is named
by its place in the branch's profile. By position, a branch that reordered two degrees compared each
with the other, and one going from exact to partial while the other went from partial to exact read
as nothing lost (#221). A degree whose line a branch rewrites is still told by its school; an entry
rewritten past anything the two say alike has no counterpart. So a section a branch adds to, removes
from or reorders is compared entry by entry, which #216 did not do for one numbered differently. An
entry of the base's with no counterpart is not on the new print, and has nothing on it to lose. One
of the branch's the base's parser reads in full lost nothing; one it reads any of short cannot be
told from an entry of the base's the branch rewrote and the parser now loses, and the step exits 2.
**The label `ats-trade-accepted` records a trade the owner accepted:** the losses are still
reported, in the job summary, and the step passes; it accepts nothing that was not compared, so
entries are added or rewritten in one pull request and the parser changed in another. A change to
one side only exits 0 and says why; a base that could not be built, read or graded exits 2. Locally
it compares the working tree with its merge base with `origin/main` (`--base=<ref>` names another),
after `npm run build:pdf`.

`build:pdf` and `audit:screen` need a Chrome or Chromium binary. They look for one on PATH, in the
usual install locations and in the Playwright cache; `CHROME_PATH` overrides. When they find none
they **exit 2** — the build having written nothing, the audit having checked nothing — because a run
that did not happen must never read as a pass, the same mistake the grayscale check made when its
filename pattern matched no files for weeks. `audit:print` and `audit:ats` need no browser, and exit
2 when the files they read were never built. So does `audit:screen` without a built
`generated/manifest.json`, where the Download link is rightly hidden and its checks would fail a page
that is right.

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
already, and so are the catalogues the page loads: `core/I18nService.js` loads `locales/` under a
`?v=` of its own (the local editor reads `ui.json` directly, and only `npm run serve`'s `no-store`
ever serves it), and a branch that edits a catalogue changes it, since a relabelled heading is a
visible change too. `tests/VersionTokensFollowEdits.test.js` fails on a branch that forgets either
(#117, #170).

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
  files the scripts write (`generated/` and the three audit reports), the harness's own files, the
  profiles, and test fixtures whose exact bytes are what the tests check. The profiles are the local
  app's to lay out: `ProfileStore` writes them with `JSON.stringify` at two spaces, which sets one
  entry of a list a line, and Prettier sets a short list on one line — so a formatted profile came
  back rewritten on the editor's next save. `tests/ProfileStore.test.js` is the guard there instead,
  and it fails on exactly that byte (#230).
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

## Known limitation — the PDF's structure tree is partial, and no screen reader has read it

Chrome writes a tagged PDF: `Tagged: yes`, over a real tree. Measured with `pdfinfo -struct` on the
three printed layouts, poppler 26.01.0 (#149): `H1` for the name, `H2` for the title, seven `H3`
section heads, six `P`, five lists with sixteen `LI` and eleven `Lbl`, and five `Link`s tied to their
annotations. Most of the page — 183 to 196 elements a layout — is `NonStruct`, Chrome's element for a
`div` or `span` with no role, and poppler reports `StructElem object is wrong type (Strong)` nine
times in every layout, most likely Chrome's tagging of `<strong>`.

Since #230 the print sets its own section order, and the tree does not follow it: Chrome builds the tree
from the markup, so a screen reader meets Core Technologies where the page prints the roles. The text layer
does follow the printed order, in both of the orders a parser reads, which is what the audits hold.

pdfmake, which composed the PDF before, wrote the tagged flag over an empty tree, and the project
refused to set it: a flag over nothing tells a screen reader structure exists, and the reader stops
looking. Chrome's tree is not nothing, but its headings and lists are only as good as the page's
markup, and nobody has listened to one. What was measured: a clean text layer in both reading
orders, no image, no Type 3 font, real link annotations, and AA contrast on the paper. That is the
accessible-enough floor, not accessibility. Until a screen reader has read the PDF, do not report
it as accessible.

## The downloadable PDF

Settled on #144 by the owner, and not to be undone by someone reclaiming space:

- **One CV, printed from the page.** `npm run build:pdf` prints each layout `config/cv-manifest.json`
  declares, under the names the page already offers, and writes `generated/manifest.json` from what
  it printed. There is no second design to keep in step.
- **One reading column, and the print sets its order.** Nothing is positioned or floated, and no grid
  moves a section: printed in two columns, the text layer put Education between the first role's
  achievements, and a parser reading in drawing order met the name after the skills (#142). The order
  of the one column is `print.css`'s, not the markup's, since #230: each screen layout arranges the
  same sections its own way, and the print gives each a place in one flex column — contacts under the
  headline, then the summary, Selected Impact, the roles, Core Technologies, the credentials. Chrome
  draws flex items in that order, so the text layer comes out in the printed order in both of the
  orders a parser reads; `audit:print` checks both, and a page that fails either fails the build. The
  one column inside a section is Nerd Mode's dates, beside the role they date and drawn before it, so
  no period leaves its role in either reading order (`print.css`).
- **Two A4 pages, in colour.** The LETTER and monochrome variants existed to audit pdfmake's design
  system. The target market is Germany, and contrast is measured word by word on the printed page,
  which covers a monochrome printout. `audit:print` fails a third page.
- **No photo.** The owner's decision on #144; `audit:print` fails a PDF that carries any image.
- **Inter from its static TrueType files, and no tracking.** Skia, Chrome's PDF backend, embeds a
  variable or CFF font as Type 3, which several extractors mishandle, and letter-spacing narrowed
  the gap a drawing-order parser reads as a word break: "GiovanniTrovato" (#143). `print.css` loads
  `vendor/fonts/inter/Inter-*.ttf` and sets `letter-spacing: 0`.
- **No OpenType feature reaches paper.** Inter maps its own alternates — the open 4, 6 and 9, the
  single-storey a, the case-sensitive punctuation `calt` substitutes beside a capital — into the
  Private Use area of its cmap, and Chrome writes whatever the cmap says into the `/ToUnicode` map
  when it embeds the subset. A reader that trusts that map, which is what a text layer is for, hands
  the code point out or drops it. `pdftohtml` read the name as "Giovnni Trovto" and the email as
  "trovto.giovnni@gmil.com" on documents `pdftotext` read whole, because `pdftotext` goes behind the
  map to the font's own cmap, and so does PDFBox: three audits read the file that way and none of
  them could see it (#238). `print.css` and `letter.css` therefore turn the features off for paper,
  and the screen keeps Inter's alternates. `audit:print` fails on any Private Use destination in any
  embedded font's map, in the CV and in the letter alike, and names the glyphs and the words a
  `pdftohtml` read and a `pdftotext` read disagree on.
  The lost-word list is not decoration: a font that does **not** map its alternates into the Private
  Use area would leave a feature glyph out of the map altogether, which the Private Use check cannot
  see and only the two reads disagreeing would show.
- **Chrome is not pinned.** The print embeds only static TrueType faces, so a Chrome update would
  have to change how Skia embeds TrueType before the PDF degraded, and `audit:print` would fail the
  build on a Type 3 font or a glued word before anything was published. Pinning a Chrome for Testing
  build is the fallback if a runner update ever does; the cost was weighed on #149.
- **Nothing in `generated/` is committed.** Chrome stamps each print with its date, so a committed
  PDF changed on every build, and the copies nobody rebuilt offered a CV older than the page. CI
  builds, audits and publishes its own; a fresh clone offers no download until `npm run build:pdf`
  has run.
- **The gate** is `audit:print` green and `audit:ats`'s floors in both reading orders, on the files
  CI publishes.

## The cover letter

Settled on #151 by the owner: one system for both documents a recruiter receives, so pdfmake could go,
and did (#153). A letter is far simpler than a CV, which kept the cost of re-expressing DIN 5008 small.

- **A page, printed by Chrome.** `letter.html?profile=<name>&lang=<locale>&layout=<layout>` renders
  the `letter` a tailored profile carries, and `npm run build:pdf` prints it beside each layout's CV,
  in the same browser session, to `<name>-<profile>-<locale>-<layout>-cover.pdf`
  (`CvFiles.letterFilename`). The `-cover` is what the audits tell a letter by. `core/LetterContent.js`
  decides the words, once, for the page and the audit alike; `renderers/LetterRenderer.js` writes them
  as text. The page never offers a letter for download, and `generated/manifest.json` lists only the
  CV. A profile without a letter, the published one included, shows a notice saying so.
- **DIN 5008 form B, in CSS millimetres.** `letter.css` sets A4 with the form's margins, 20mm and
  24.1mm on the left, and lays the letter out as blocks of fixed height in normal flow. The letterhead
  fills the 25mm down to the address field, which is 85mm by 45mm, 45mm from the top edge and 20mm
  from the left, and holds no blank line. Its upper 17.7mm, the Zusatz- und Vermerkzone, is filled
  from the bottom: the return line sits at its foot in 8pt. Its lower 27.3mm, the Anschriftzone, from
  62.7mm to 90mm, holds the recipient in at most six lines of 10pt at 4.5mm. The date follows,
  right-aligned, with the reference beneath it, then the subject: at 98.46mm when the date stands
  alone, lower when a reference joins it, rather than overlapping them. pdfmake's letter layout had
  put the recipient at 45mm, where a window envelope does not show it; the review of #151 found it
  against the standard. Nothing is positioned, floated or reordered by a grid, so the text layer
  gives the letter in the order a reader meets it, in both of the orders a parser reads. Measured on
  a probe letter with poppler: the text's left edge at 24.1mm, the return line 59.2–62.6mm from the
  top, the recipient's five lines 62.7–85.0mm, the date and reference 90.6–99.2mm, the subject's
  glyphs from 102.5mm, one page.
- **Inter from its static TrueType files, and no tracking,** as the CV prints, for the same reasons
  (#143). `letter.css` declares only the faces the letter prints in and never loads
  `vendor/fonts/fonts.css`. Impact Spotlight sets the sender's name in Instrument Serif, as
  `print.css` sets the CV's name.
- **Its audit.** `npm run audit:print` reads every letter the build wrote beside the CV, exits 2 when
  one is missing, and scores each on checks of its own: A4, one page, the recipient's company, the
  subject and the signature, the letter's parts in reading order in both orders, the address in the
  window, contrast on the paper, no pictograph, the intended typefaces, no Type 3 font, no image, and
  every margin at least 10mm. The address in the window is read from where poppler places each line:
  the return line within 45–62.7mm of the top edge, every line of the recipient within 62.7–90mm, and
  both within a DL window envelope's window, 20–110mm across; a line outside is named with where it
  is. The sides are not compared, as a CV's are: form B is asymmetric by design. `npm run audit:ats`
  keeps asking a `-cover` file only whether the recipient and the subject survive extraction.
- **The salutation follows the form of address the author writes (#174),** never one inferred from a
  first name. The recipient carries `form` — `ms`, `mr` or `neutral`, codes the catalogue words in
  each language — with `surname` and an optional `title` written as the letter's language writes
  it: `ms` and `mr` greet by title and surname ("Sehr geehrte Frau Dr. Schmidt,", "Dear Dr Schmidt,"),
  `neutral` greets `name` as the address writes it ("Guten Tag Anna Schmidt,"), and nobody named
  gets the anonymous opening. A named recipient without a form, or a form without the surname it
  needs, is greeted neutrally, since cutting a surname from a name is guessing, and
  `CoverLetter.missing` names the field so the build warns. The address block carries the form too,
  on the name's line and adding none (#182): `ms` and `mr` put the catalogue's `addressMs` or
  `addressMr` before the name — "Frau Dr. Anna Schmidt", "Herrn Max Mustermann" in the accusative —
  and an empty wording leaves the name as written, as English's does, since Royal Mail treats a
  title there as optional: whether a language writes one is the catalogue's call.
- **The build warns first.** A recipient past six lines runs out of the address zone onto the date's
  row, and the audit fails it; a letter missing a field it needs is weaker, and the audit may not see
  it. `CoverLetter.problems` names both — each field `missing` names, and a recipient longer than
  `ADDRESS_ZONE_LINES` — and `npm run build:pdf` prints each to stderr, with the profile's path, before
  it prints anything. It still writes the files as the data wrote them: no line is dropped to make an
  address fit, and the audit stays the gate.
- **The letter's page is not published.** The site CI assembles leaves out `letter.html`, `letter.js`
  and `letter.css`, as it leaves out the editor, and checks that it did: the published profile carries
  no letter, so published, the page could only say so. `tests/EditorStaysLocal.test.js` holds the
  assembly to it. The page is served by `npm run serve`, which hands a tailored profile only to this
  machine's browser holding the run's key.
- **CI never prints a letter.** The published profile carries none, so the gates build and audit no
  letter, and a change that breaks `letter.html` passes every gate. A letter is verified
  only on a machine where an `applications/` profile carries one: `npm run build:pdf` with its
  `--profile`, then both audits with the same one. The unit tests hold the words, the renderer, the
  file names and the audit's rules; nothing holds the printed letter but that run. That is a limit,
  and it is stated here so nobody reads a green CI as a checked letter.

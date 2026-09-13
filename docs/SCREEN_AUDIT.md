# Screen copy matrix

What a reader copies off the page: each layout opened in headless Chrome at a desktop and a phone
width, its CV selected, and the selection read. Regenerate with `npm run audit:screen`.

| Layout | Width | Layout shift | Score |
|---|---:|---:|---:|
| nerd | 1280px | 0.000 | 10/10 |
| nerd | 390px | 0.000 | 10/10 |
| spotlight | 1280px | 0.000 | 10/10 |
| spotlight | 390px | 0.000 | 10/10 |
| technical | 1280px | 0.000 | 10/10 |
| technical | 390px | 0.000 | 10/10 |

Checks: the CV captured whole — name, role, email and current employer; no two words the profile
writes in sequence welded into one, and no contact detail run into the word beside it; every skill
category followed by its own first skill; every language on a line with its level; nothing on a
line the data did not write — no pictograph, no line number; and the first screen holding still
while it loads — every layout shift from navigation to fonts ready, added up, below 0.1.

## The Download PDF link

| Layout | Width | Top copy | Heights | Focus ring |
|---|---:|---:|---:|---:|
| nerd | 1280px | 11–41px | 30 · 35px | 12.77:1 |
| nerd | 390px | 62–106px | 44 · 43px | 14.01:1 |
| spotlight | 1280px | 85–140px | 55 · 55px | 6.82:1 |
| spotlight | 390px | 97–141px | 44 · 78px | 6.82:1 |
| technical | 1280px | 85–140px | 55 · 55px | 6.87:1 |
| technical | 390px | 97–141px | 44 · 78px | 6.87:1 |

Checks, the four the product review of #59 measured by hand (#101): hidden without a PDF — loaded
with `generated/manifest.json` answered 404, every copy computes `display: none`; reachable — the
top copy inside the first screen and, where the layout pins it, still inside the viewport and
topmost after scrolling to the end; tappable — on a phone every visible copy renders at least 43px
and the top copy 44px, ±1; and a visible focus — reached with Tab, a drawn ring that clears 3:1
against the background just outside the link, once its transitions finish. Top copy is where it
spans from the top of the page, heights are every visible copy in page order, and the ring is its
contrast.

# Screen copy matrix

What a reader copies off the page: each layout opened in headless Chrome at a desktop and two phone
width, its CV selected, and the selection read. Regenerate with `npm run audit:screen`.

| Layout | Width | Layout shift | Score |
|---|---:|---:|---:|
| nerd | 1280px | 0.000 | 13/13 |
| nerd | 390px | 0.000 | 13/13 |
| nerd | 320px | 0.000 | 13/13 |
| spotlight | 1280px | 0.000 | 12/13 |
| spotlight | 390px | 0.000 | 12/13 |
| spotlight | 320px | 0.000 | 12/13 |
| technical | 1280px | 0.000 | 12/13 |
| technical | 390px | 0.000 | 12/13 |
| technical | 320px | 0.000 | 12/13 |

Checks: the CV captured whole — name, role, email and current employer; no two words the profile
writes in sequence welded into one, and no contact detail run into the word beside it; every skill
category followed by its own first skill; every language on a line with its level; nothing on a
line the data did not write — no pictograph, no line number; and the first screen holding still
while it loads — every layout shift from navigation to fonts ready, added up, below 0.1.

## The Download PDF link

| Layout | Width | Top copy | Heights | Label lines | Focus ring | Secondary button |
|---|---:|---:|---:|---:|---:|---:|
| nerd | 1280px | 11–41px | 30 · 35 · 32px | 1 · 1 · 1 | 12.77:1 | border 1.56:1 |
| nerd | 390px | 62–106px | 44 · 44 · 44px | 1 · 1 · 1 | 14.01:1 | border 1.56:1 |
| nerd | 320px | 62–106px | 44 · 44 · 44px | 1 · 1 · 1 | 14.01:1 | border 1.56:1 |
| spotlight | 1280px | 85–140px | 55 · 55 · 55px | 1 · 1 · 1 | 6.82:1 | border 4.99:1 |
| spotlight | 390px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.82:1 | border 4.99:1 |
| spotlight | 320px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.82:1 | border 4.99:1 |
| technical | 1280px | 85–140px | 55 · 55 · 55px | 1 · 1 · 1 | 6.87:1 | border 7.87:1 |
| technical | 390px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.87:1 | border 7.87:1 |
| technical | 320px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.87:1 | border 7.87:1 |

Checks, the four the product review of #59 measured by hand (#101): hidden without a PDF — loaded
with `generated/manifest.json` answered 404, every copy computes `display: none`; reachable — the
top copy inside the first screen and, where the layout pins it, still inside the viewport and
topmost after scrolling to the end; tappable — on a phone every visible copy, and the footer button
beside it (#109), renders at least 43px, and the top copy 44px, ±1; and a visible focus — reached
with Tab, a drawn ring that clears 3:1 against the background just outside the link, once its
transitions finish. A fifth since #107: every visible copy, and the footer button beside it,
renders its label on one line, at every width. Top copy is where it spans from the top of the page;
heights and label lines are every visible copy in page order, then the footer button; the ring is
its contrast. The secondary button in the footer is checked as well (#110): it carries no shadow in any
layout, and where the layout outlines it, in Impact Spotlight and Technical Profile, its border clears
3:1 against the footer as painted. Secondary button is that border and its contrast.

## Focus rings

| Layout | Width | Rings |
|---|---:|---|
| nerd | 1280px | 25 controls, worst 11.14:1 (Profile) |
| nerd | 390px | 25 controls, worst 11.16:1 (Profile) |
| nerd | 320px | 25 controls, worst 10.71:1 (Profile) |
| spotlight | 1280px | 11 controls, worst 1.84:1 (piglardlord.github.io/cv-giovanni) |
| spotlight | 390px | 11 controls, worst 1.67:1 (piglardlord.github.io/cv-giovanni) |
| spotlight | 320px | 11 controls, worst 1.66:1 (piglardlord.github.io/cv-giovanni) |
| technical | 1280px | 11 controls, worst 2.85:1 (Nerd Mode) |
| technical | 390px | 11 controls, worst 2.29:1 (Impact Spotlight) |
| technical | 320px | 11 controls, worst 2.85:1 (Nerd Mode) |

Every control a keyboard reaches is focused with Tab, in order from the top of the page, and its ring read
from a screenshot (#111): along its straight edges, each ring pixel against the pixel just outside the ring and
the one between ring and control, or the control itself where the ring touches it. A ring under 3:1 anywhere
fails, and so does one that could not be read. Rings is how many controls Tab reached, and the worst ring.

# Screen copy matrix

What a reader copies off the page: each layout opened in headless Chrome at a desktop width, a tablet
width and two phone widths, its CV selected, and the selection read. Regenerate with `npm run audit:screen`.

| Layout | Width | Layout shift | Score |
|---|---:|---:|---:|
| nerd | 1280px | 0.000 | 16/16 |
| nerd | 820px | 0.000 | 16/16 |
| nerd | 390px | 0.000 | 16/16 |
| nerd | 320px | 0.000 | 16/16 |
| spotlight | 1280px | 0.000 | 16/16 |
| spotlight | 820px | 0.000 | 16/16 |
| spotlight | 390px | 0.000 | 16/16 |
| spotlight | 320px | 0.000 | 16/16 |
| technical | 1280px | 0.000 | 16/16 |
| technical | 820px | 0.000 | 16/16 |
| technical | 390px | 0.000 | 16/16 |
| technical | 320px | 0.000 | 16/16 |

Checks: the CV captured whole — name, role, email and current employer; no two words the profile
writes in sequence welded into one, and no contact detail run into the word beside it; every skill
category followed by its own first skill; every language on a line with its level; nothing on a
line the data did not write — no pictograph, no line number; and the first screen holding still
while it loads — every layout shift from navigation to fonts ready, added up, below 0.1.

## The Download PDF link

| Layout | Width | Top copy | Heights | Label lines | Focus ring | Secondary button | Forced colours |
|---|---:|---:|---:|---:|---:|---:|---:|
| nerd | 1280px | 11–41px | 30 · 35 · 35px | 1 · 1 · 1 | 12.77:1 | border 1.56:1 (quiet) | 1 · 1 · 1px |
| nerd | 820px | 11–41px | 30 · 35 · 35px | 1 · 1 · 1 | 12.77:1 | border 1.56:1 (quiet) | 1 · 1 · 1px |
| nerd | 390px | 62–106px | 44 · 44 · 44px | 1 · 1 · 1 | 14.01:1 | border 1.56:1 (quiet) | 1 · 1 · 1px |
| nerd | 320px | 62–106px | 44 · 44 · 44px | 1 · 1 · 1 | 14.01:1 | border 1.56:1 (quiet) | 1 · 1 · 1px |
| spotlight | 1280px | 85–140px | 55 · 55 · 55px | 1 · 1 · 1 | 6.82:1 | border 4.99:1 | 3 · 3 · 1px |
| spotlight | 820px | 85–140px | 55 · 55 · 55px | 1 · 1 · 1 | 6.82:1 | border 4.99:1 | 3 · 3 · 1px |
| spotlight | 390px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.82:1 | border 4.99:1 | 3 · 3 · 1px |
| spotlight | 320px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.82:1 | border 4.99:1 | 3 · 3 · 1px |
| technical | 1280px | 85–140px | 55 · 55 · 55px | 1 · 1 · 1 | 6.87:1 | border 7.87:1 | 3 · 3 · 1px |
| technical | 820px | 85–140px | 55 · 55 · 55px | 1 · 1 · 1 | 6.87:1 | border 7.87:1 | 3 · 3 · 1px |
| technical | 390px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.87:1 | border 7.87:1 | 3 · 3 · 1px |
| technical | 320px | 97–141px | 44 · 44 · 44px | 1 · 1 · 1 | 6.87:1 | border 7.87:1 | 3 · 3 · 1px |

Checks, the four the product review of #59 measured by hand (#101): hidden without a PDF — loaded
with `generated/manifest.json` answered 404, every copy computes `display: none`; reachable — the
top copy inside the first screen and, where the layout pins it, still inside the viewport and
topmost after scrolling to the end; tappable — on a phone every visible copy, and the footer button
beside it (#109), renders at least 43px, and the top copy 44px, ±1; and a visible focus — reached
with Tab, a drawn ring that clears 3:1 against the background just outside the link, once its
transitions finish. A fifth since #107: every visible copy, and the footer button beside it,
renders its label on one line, at every width. A sixth since #116: the footer copy and the button
beside it render one height, within a pixel. Top copy is where it spans from the top of the page;
heights and label lines are every visible copy in page order, then the footer button; the ring is
its contrast. The secondary button in the footer is checked as well (#110): it carries no shadow in any
layout, at rest or with :hover forced (#119), and its border clears 3:1 against the footer as painted in
every layout that does not keep it quiet on purpose with a stated reason, as Nerd Mode does, marked
(quiet). Secondary button is that border and its contrast. And with forced colours emulated, which drop
fills and shadows and keep borders, every copy of the link and every footer button draws a border, the
primary's no thinner than the secondary's (#119); and the current layout's link in the switcher is told
from the others there by a marker the palette keeps, an underline or a wider border (#127). Forced colours
is each border's width, in page order.

## Focus rings

| Layout | Width | Rings |
|---|---:|---|
| nerd | 1280px | 25 controls, worst 11.14:1 (Profile) |
| nerd | 820px | 25 controls, worst 10.71:1 (Profile) |
| nerd | 390px | 25 controls, worst 11.16:1 (Profile) |
| nerd | 320px | 25 controls, worst 10.71:1 (Profile) |
| spotlight | 1280px | 11 controls, worst 4.23:1 (↓ Download PDF) |
| spotlight | 820px | 11 controls, worst 4.23:1 (↓ Download PDF) |
| spotlight | 390px | 11 controls, worst 4.23:1 (↓ Download PDF) |
| spotlight | 320px | 11 controls, worst 4.23:1 (↓ Download PDF) |
| technical | 1280px | 11 controls, worst 3.92:1 (↓ Download PDF) |
| technical | 820px | 11 controls, worst 3.92:1 (↓ Download PDF) |
| technical | 390px | 11 controls, worst 3.92:1 (↓ Download PDF) |
| technical | 320px | 11 controls, worst 3.92:1 (↓ Download PDF) |

Every control a keyboard reaches is focused with Tab, in order from the top of the page, and its ring read
from a screenshot (#111): along its straight edges, each ring pixel against the pixel just outside the ring and
the one between ring and control, or the control itself where the ring touches it. A ring under 3:1 anywhere
fails, and so does one that could not be read. Rings is how many controls Tab reached, and the worst ring.

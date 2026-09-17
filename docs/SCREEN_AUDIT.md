# Screen copy matrix

What a reader copies off the page: each layout opened in headless Chrome at a desktop width, a tablet
width and two phone widths, its CV selected, and the selection read. Regenerate with `npm run audit:screen`.

| Layout | Width | Layout shift | Score |
|---|---:|---:|---:|
| nerd | 1280px | 0.000 | 17/17 |
| nerd | 820px | 0.000 | 17/17 |
| nerd | 390px | 0.000 | 17/17 |
| nerd | 320px | 0.000 | 17/17 |
| spotlight | 1280px | 0.000 | 17/17 |
| spotlight | 820px | 0.000 | 17/17 |
| spotlight | 390px | 0.000 | 17/17 |
| spotlight | 320px | 0.000 | 17/17 |
| technical | 1280px | 0.000 | 17/17 |
| technical | 820px | 0.000 | 17/17 |
| technical | 390px | 0.000 | 17/17 |
| technical | 320px | 0.000 | 17/17 |

Checks: the CV captured whole — name, role, email and current employer; no two words the profile
writes in sequence welded into one, and no contact detail run into the word beside it; every skill
category followed by its own first skill; every language on a line with its level; nothing on a
line the data did not write — no pictograph, no line number; and the first screen holding still
while it loads — every layout shift from navigation to fonts ready, added up, below 0.1.

Since #180 the lines the CV is laid on are read as well, from the box of every character the page
draws, because a copy has a space where a line broke. No line starts or ends with a separator, `·`,
`–`, `—` or `|`, and no period the profile writes is split across two lines; a period wider than its
line may break after its dash, and only there. A failure names the text either side of the break.

## The Download PDF link

| Layout | Width | Controls | Top copy | Heights | Label lines | Focus ring | Forced colours |
|---|---:|---:|---:|---:|---:|---:|---:|
| nerd | 1280px | 1 | 11–41px | 30px | 1 | 12.77:1 | 1px |
| nerd | 820px | 1 | 11–41px | 30px | 1 | 12.77:1 | 1px |
| nerd | 390px | 1 | 62–106px | 44px | 1 | 14.01:1 | 1px |
| nerd | 320px | 1 | 62–106px | 44px | 1 | 14.01:1 | 1px |
| spotlight | 1280px | 1 | 85–140px | 55px | 1 | 14.22:1 | 3px |
| spotlight | 820px | 1 | 85–140px | 55px | 1 | 14.22:1 | 3px |
| spotlight | 390px | 1 | 97–141px | 44px | 1 | 14.22:1 | 3px |
| spotlight | 320px | 1 | 97–141px | 44px | 1 | 14.22:1 | 3px |
| technical | 1280px | 1 | 85–140px | 55px | 1 | 13.50:1 | 3px |
| technical | 820px | 1 | 85–140px | 55px | 1 | 13.50:1 | 3px |
| technical | 390px | 1 | 97–141px | 44px | 1 | 13.50:1 | 3px |
| technical | 320px | 1 | 97–141px | 44px | 1 | 13.50:1 | 3px |

Checks, the four the product review of #59 measured by hand (#101): hidden without a PDF — loaded
with `generated/manifest.json` answered 404, every copy computes `display: none`; reachable — the
top copy inside the first screen and, where the layout pins it, still inside the viewport and
topmost after scrolling to the end; tappable — on a phone every visible copy renders at least 43px,
and the top copy 44px, ±1; and a visible focus — reached with Tab, a drawn ring that clears 3:1
against the background just outside the link, once its transitions finish. A fifth since #107: every
visible copy renders its label on one line, at every width. A sixth since #150: the page shows one
download control, and a second visible copy fails; a page that shows none already fails as not
reachable, and is not reported twice. With forced colours emulated, which drop fills and shadows and
keep borders, every visible copy draws a border (#119); and the current layout's link in the switcher
is told from the others there by a marker the palette keeps, an underline or a wider border (#127).
Controls is how many copies show; top copy is where it spans from the top of the page; heights, label
lines and forced colours are each visible copy's, in page order; the ring is its contrast.

#150 removed the footer, its copy of the link and its Browser print button, and the checks that existed
only for them: the secondary button drawing no shadow at rest or on hover and an outline that clears
3:1 (#110, #119); the footer's button tappable beside the link (#109) and holding its label on one line
(#107); the footer's copy and that button at one height (#116); and, in forced colours, the primary's
border no thinner than the secondary's (#119).

## Focus rings

| Layout | Width | Rings |
|---|---:|---|
| nerd | 1280px | 23 controls, worst 11.14:1 (Profile) |
| nerd | 820px | 23 controls, worst 10.71:1 (Profile) |
| nerd | 390px | 23 controls, worst 11.16:1 (Profile) |
| nerd | 320px | 23 controls, worst 10.71:1 (Profile) |
| spotlight | 1280px | 9 controls, worst 6.16:1 (piglardlord.github.io/cv-giovanni) |
| spotlight | 820px | 9 controls, worst 6.51:1 (Nerd Mode) |
| spotlight | 390px | 9 controls, worst 5.59:1 (piglardlord.github.io/cv-giovanni) |
| spotlight | 320px | 9 controls, worst 5.55:1 (piglardlord.github.io/cv-giovanni) |
| technical | 1280px | 9 controls, worst 6.75:1 (Nerd Mode) |
| technical | 820px | 9 controls, worst 6.75:1 (Nerd Mode) |
| technical | 390px | 9 controls, worst 6.75:1 (Nerd Mode) |
| technical | 320px | 9 controls, worst 6.75:1 (Nerd Mode) |

Every control a keyboard reaches is focused with Tab, in order from the top of the page, and its ring read
from a screenshot (#111): along its straight edges, each ring pixel against the pixel just outside the ring and
the one between ring and control, or the control itself where the ring touches it. A ring under 3:1 anywhere
fails, and so does one that could not be read. Rings is how many controls Tab reached, and the worst ring.

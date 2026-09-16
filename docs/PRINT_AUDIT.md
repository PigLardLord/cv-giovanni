# Print quality matrix

The CV `npm run build:pdf` printed from the page, measured on the artefact: the text layer
poppler extracts and the pixels the page put on the paper. Regenerate with `npm run verify:pdf`.

Layouts: 3

| Layout | Pages | Score | Worst side margin | Room left |
|---|---:|---:|---:|---|
| nerd | 2 | 20/20 | 13.7mm | p1 36.8pt · p2 2.5pt ⚠ |
| spotlight | 2 | 20/20 | 33.5mm | p1 54.0pt · p2 11.5pt ⚠ |
| technical | 2 | 20/20 | 33.5mm | p1 58.5pt · p2 11.5pt ⚠ |

Room left is the space between each page's lowest line, its running footer aside, and its
33pt bottom margin. A last page with less than one 15.4pt line of running text
free is marked ⚠: the next line added to it has nowhere to go. It is a warning, never a failure,
since the page count is the gate.

⚠ Tight last page: nerd (2.5pt), spotlight (11.5pt), technical (11.5pt).

Checks: A4, at most two pages, required ATS text in the case the catalogue wrote it,
reading order, canonical hyphenated compounds, degree beside its school, every skill
attached to its category, every role present, every word at 4.5:1 on paper, margins
no narrower than 10mm and symmetric within 1.5mm (the running footer's line aside),
a text layer carrying nothing the data did not write, every run of text set in a typeface
its layout prints in, no Type 3 font, and, read in drawing order as PDFBox and Tika read,
the name, titles, employers, schools and skill categories with the spaces between their
words, the sections in reading order both as poppler reconstructs the page and as the PDF
draws it, no image, no line of prose past 80 characters (WCAG 1.4.8; lists of skills, interests
and contacts are scanned, not read along a measure, and are exempt), in Nerd Mode every line
of a role's dates inside its column, and from page 2 on a running footer naming the candidate
and counting the pages in the catalogue's words: a line of its own in the bottom margin, at
least 6mm above the paper's edge, at its page's end both as poppler reconstructs the page
and as the PDF draws it, and none on page 1.

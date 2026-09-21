# Print quality matrix

The CV `npm run build:pdf` printed from the page, measured on the artefact: the text layer
poppler extracts and the pixels the page put on the paper. Regenerate with `npm run verify:pdf`.

Layouts: 3

| Layout | Pages | Score | Worst side margin | Room left |
|---|---:|---:|---:|---|
| nerd | 2 | 26/26 | 13.7mm | p1 29.3pt · p2 198.3pt |
| spotlight | 2 | 26/26 | 33.5mm | p1 6.0pt · p2 185.5pt |
| technical | 2 | 26/26 | 33.5mm | p1 9.8pt · p2 188.5pt |

Room left is the space between each page's lowest line and its 33pt bottom margin. A last
page with less than one 15.4pt line of running text free is marked ⚠: the next line
added to it has nowhere to go. It is a warning, never a failure, since the page count is the gate.

Checks: A4, at most two pages, required ATS text in the case the catalogue wrote it,
reading order, canonical hyphenated compounds, degree beside its school, every skill
attached to its category, every role present, every word at 4.5:1 on paper, margins
no narrower than 10mm and symmetric within 1.5mm, a text layer carrying nothing
the data did not write and no trace of a field left empty (no `()`, no `undefined` or `null`, no
separator doubled on its line, no entry ending on the separator of a part it does not have),
every run of text set in a typeface its layout prints in, no Type 3 font, no glyph mapped to a Private
Use code point,
and, read in drawing order as PDFBox and Tika read, the name, titles, employers, schools and
skill categories with the spaces between their words, the sections in reading order both as
poppler reconstructs the page and as the PDF draws it, no image, no line of prose past
80 characters (WCAG 1.4.8; lists of skills, interests and contacts are scanned, not read along a
measure, and are exempt), in Nerd Mode every line of a role's dates inside its column, every bullet set over no
more than 2 printed lines and the summary over no more than 3, and every role whole on one page, so no
page opens on a bullet whose role heading stands on the page before, and every line of the masthead on the
page's left edge, none of them opening or closing on a separator.

The checks the score counts: format, pages, content, readingOrder, canonicalCompounds, blockIntegrity, skillsAttached, rolesPresent, contrast, margins, textLayerClean, noEmptyFieldMarks, intendedTypeface, noType3Fonts, noPrivateUseGlyphs, wordsSpacedInDrawingOrder, sectionsInOrder, sectionsInOrderDrawn, noImages, measure, datesInColumn, bulletsScan, summaryScans, rolesWhole, mastheadAligned, mastheadSeparatorsHeld.

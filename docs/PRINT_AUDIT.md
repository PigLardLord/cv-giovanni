# Print quality matrix

What the browser prints, measured on the artefact: the text layer poppler extracts
and the pixels the page put on the paper. Regenerate with `npm run audit:print`.

Layouts: 3

| Layout | Pages | Score | Worst side margin |
|---|---:|---:|---:|
| nerd | 2 | 17/17 | 13.7mm |
| spotlight | 2 | 17/17 | 33.5mm |
| technical | 2 | 17/17 | 33.5mm |

Checks: A4, at most two pages, required ATS text in the case the catalogue wrote it,
reading order, canonical hyphenated compounds, degree beside its school, every skill
attached to its category, every role present, every word at 4.5:1 on paper, margins
no narrower than 10mm and symmetric within 1.5mm, a text layer carrying nothing
the data did not write, every run of text set in a typeface its layout prints in, no Type 3 font,
and, read in drawing order as PDFBox and Tika read, the name, titles, employers, schools and
skill categories with the spaces between their words, the sections in reading order both as
poppler reconstructs the page and as the PDF draws it, and no image.

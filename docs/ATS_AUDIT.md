# Recoverability

**Recoverability 80/80** — advert not scored, so the total is out of 80

This number is computed by this repository from the table at the foot of this page. No
vendor produces it, no applicant tracking system uses it, and no employer will ever see
it. It is comparable with itself over time and with nothing else.

It models **one** parser: the strictest naive reading of the text layer, with no layout
analysis at all. Real parsers do better. Treat it as a floor, not a prediction.

No advert was given, so the advert band is unscored. It is **not** rescaled: a missing input must not read as a pass.

On what an applicant tracking system actually does: 92% of 25 recruiters surveyed in
September–October 2025 reported that their system does not auto-reject on résumé content,
and all of them used knockout questions, which are answered on the application form
[B, vendor-run, n=25]. The widely repeated "75% of résumés are auto-rejected" figure
traces to a 2012 sales pitch with no published method; it is not repeated here.

## What each artefact gave back

| Artefact | Contacts | Structure | Fidelity | Links | Roles intact |
|---|---|---|---|---|---|
| generated/giovanni-trovato-general-en-nerd.pdf | normalised | ok | exact | 3/3 | yes |
| generated/giovanni-trovato-general-en-spotlight.pdf | normalised | ok | exact | 3/3 | yes |

## What did not come back

Nothing. Every field the document writes came back in its own slot.


## Floors, in both reading orders

Four failures gate the audit whatever the number says: a document that did not segment, a lost email, a role severed from its title or period, and a chronology that does not run one way. Each is checked in poppler's reading order (`pdftotext`) and in content-stream order (`pdftotext -raw`), which PDFBox and Tika read by default.

| Artefact | Poppler's order | Content-stream order |
|---|---|---|
| generated/giovanni-trovato-general-en-nerd.pdf | pass | pass |
| generated/giovanni-trovato-general-en-spotlight.pdf | pass | pass |

## The advert

No advert was given, so nothing was matched against one.

## How the number is composed

| Band | Weight | What it measures |
|---|---:|---|
| Contactability | 25 | If the parsed record cannot reach the candidate, nothing downstream matters. |
| Structural recovery | 35 | The field set that goes into the database and gets searched. |
| Content fidelity | 20 | Strings surviving, minus anything recovered that was never written. |
| Advert evidence | 20 | Required terms evidenced in experience rather than listed. |

**A degree is compared as the document prints it.** Its name and the scope it states after the name, "… Development (60 ECTS)", are built by `degreeLine` in `domain/EntryLines.js`, the function the page prints the degree with, in the catalogue's words. A parser that returns that line lost nothing the document said, so a stated scope costs nothing. A degree recovered without the scope it printed, or cut short, lost part of what the document said, and is graded partial. A certification is compared the same way, as its line prints with its issuer and year.

**The number is printed as computed:** a whole number as one, a fraction cut to one decimal and never rounded, so a partial loss never reads as full marks. Every field graded partial, wrong or lost is listed under _What did not come back_, and one that carries no weight — the title under the name, a certification — is marked _not scored_: it is named so the loss is seen, and costs nothing because no band weighs it.

Regenerate with `npm run audit:ats`.

## Distinct text streams

3 artefacts, 2 distinct streams.

- `7051ed00844e` — generated/giovanni-trovato-general-en-nerd.pdf
- `c8d5a46cf9ba` — generated/giovanni-trovato-general-en-spotlight.pdf, generated/giovanni-trovato-general-en-technical.pdf


A layout-aware read recovers the same structure everywhere, so no column is being serialised.

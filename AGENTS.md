# MyCV product guidance

## Skills presentation

The skills section must give a recruiter an immediate overview without turning an unanchored self-rating into the main evidence of competence.

### Evidence reviewed

- Nielsen Norman Group explicitly identifies bars and dot ratings on resumes as arbitrary, subjective, context-free, and space-inefficient. It recommends showing where a skill was used and what it achieved: https://www.nngroup.com/articles/resumes-ux-career-changers/
- A randomized experiment with 579 German HR managers found that skill signals can affect interview invitations, but their value depends on relevance, expectedness, and credibility. This supports presenting credible signals rather than undifferentiated keyword lists: https://doi.org/10.1016/j.euroecorev.2020.103374
- Europass uses CEFR (A1-C2) and behavioral descriptors for language self-assessment. This is an appropriate standardized scale for languages: https://europass.europa.eu/en/how-self-assess-your-language-skills
- Oracle Taleo documents plain-text resume parsing. Because graphical meaning may not survive parsing, every skill and level must remain available as real text: https://docs.oracle.com/en/cloud/saas/taleo-enterprise/24c/otcug/implementing-career-section.pdf

### Product decision

- Preserve fast visual scanning and a compact, prioritized skills section.
- Dots may be offered as an optional visual reinforcement, but never as the only expression of proficiency.
- Every displayed rating must have a textual equivalent in HTML, print, PDF, accessibility output, and extracted text.
- Do not use unexplained `3/5`, percentages, or generic `beginner-to-expert` graphics. Define a small anchored scale with observable meanings, for example `Core`, `Proficient`, and `Familiar`.
- Use CEFR labels for languages; do not map language ability to generic skill dots.
- Keep the list selective and role-specific. A level should be supported by evidence in experience achievements, projects, duration, scope, or outcomes.
- Keep ATS-safe skill names as plain text and ensure the meaningful reading order survives copy/paste and PDF text extraction.
- Treat the skills visualization as a layout variant that can be compared with a compact grouped-text variant; do not claim either variant improves hiring outcomes without measured evidence.

### Acceptance criteria

- A recruiter can identify the candidate's strongest role-relevant skills in a few seconds.
- A reader can understand every level without guessing what a dot means.
- Removing CSS, icons, or graphical markers does not remove skill names or proficiency meaning.
- The CV does not claim precision that the underlying self-assessment cannot justify.

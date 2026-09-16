import { BANDS } from './AtsScore.js';

const LADDER = ['exact', 'normalised', 'partial', 'wrong', 'lost'];

/**
 * The report, and the sentences that keep the number honest.
 *
 * The framing is assembled here rather than in the script so that
 * `tests/AtsReport.test.js` can assert it. A disclaimer that lives only in a comment gets
 * deleted; one that a test requires does not.
 */
export class AtsReport {
  /**
   * @param {Object} score - An AtsScore result
   * @param {Array<{artefact: string, diff: Object}>} results - One entry per artefact
   * @param {Object|null} [advert] - A matched advert, when one was given
   * @returns {string} Markdown
   */
  static render(score, results, advert = null) {
    return [
      '# Recoverability',
      '',
      `**Recoverability ${AtsReport.figure(score.points)}/${score.denominator}**${AtsReport.unscoredNote(score)}`,
      '',
      ...AtsReport.disclaimer(score),
      '',
      '## What each artefact gave back',
      '',
      '| Artefact | Contacts | Structure | Fidelity | Links | Roles intact |',
      '|---|---|---|---|---|---|',
      ...results.map((entry) => AtsReport.row(entry)),
      '',
      ...AtsReport.findings(results),
      '',
      ...AtsReport.floorsSection(results),
      '',
      ...AtsReport.advertSection(advert),
      '',
      '## How the number is composed',
      '',
      '| Band | Weight | What it measures |',
      '|---|---:|---|',
      `| Contactability | ${BANDS.contactability.weight} | If the parsed record cannot reach the candidate, nothing downstream matters. |`,
      `| Structural recovery | ${BANDS.structure.weight} | The field set that goes into the database and gets searched. |`,
      `| Content fidelity | ${BANDS.fidelity.weight} | Strings surviving, minus anything recovered that was never written. |`,
      `| Advert evidence | ${BANDS.advert.weight} | Required terms evidenced in experience rather than listed. |`,
      '',
      'Regenerate with `npm run audit:ats`.'
    ].join('\n');
  }

  /**
   * The gap table, and the distinction that is worth more than the number.
   *
   * Two columns, because the two kinds of gap belong to different people. A term the CV
   * writes that the artefact lost is a **layout defect** — the copy is right and the renderer
   * is wrong. A term the CV never wrote is a **content gap**, and it is a human's decision.
   *
   * An absent term is stated and nothing more. The tool never suggests adding one: a term the
   * experience does not support is a fabrication, and a helpful suggestion is how a fabricated
   * CV gets built one line at a time.
   */
  static advertSection(advert) {
    if (!advert) {
      return ['## The advert', '', 'No advert was given, so nothing was matched against one.'];
    }

    const kind = (term) => {
      if (term.evidence !== 'absent')
        return term.evidence === 'inProse' ? 'evidenced' : 'listed only';
      return term.authored ? 'LAYOUT DEFECT — written, not recovered' : 'content gap — not claimed';
    };

    const lines = ['## The advert', ''];
    if (advert.language) {
      lines.push(`Written in \`${advert.language.language}\`.`, '');
    }
    lines.push('| Term | Required | Where the CV answers | Reading |', '|---|---|---|---|');
    for (const term of advert.terms) {
      lines.push(
        `| ${term.term} | ${term.required ? 'yes' : ''} | ${term.where || '—'} | ${kind(term)} |`
      );
    }

    const defects = advert.terms.filter((term) => term.evidence === 'absent' && term.authored);
    const gaps = advert.terms.filter(
      (term) => term.evidence === 'absent' && term.authored === false
    );
    lines.push(
      '',
      `**${defects.length} layout defects** — the CV claims these and the artefact lost them. Fix the renderer, not the copy.`,
      `**${gaps.length} content gaps** — the CV does not claim these. Whether any of them should be claimed is a decision for a person, and this tool does not make it.`
    );

    if (advert.opening) {
      lines.push(
        '',
        advert.opening.missing.length
          ? `The opening fifteen lines establish ${advert.opening.present.length} of ${advert.opening.present.length + advert.opening.missing.length} required terms. A reader deciding whether to continue has not reached the skills section.`
          : 'Every required term appears in the opening fifteen lines.'
      );
    }
    return lines;
  }

  /**
   * Points as the report prints them: a whole number as one, a fraction cut to one decimal.
   *
   * Cut, never rounded: rounding printed a degree graded partial, 79.5, as full marks (#186), and
   * 79.96 would still round to 80. A millionth is added before cutting, because a sum of shares
   * can come out a hair under its value, and no loss this model grades is that small.
   * @param {number} points - A composed score's points
   * @returns {string} The figure
   */
  static figure(points) {
    const cut = Math.floor(points * 10 + 1e-6) / 10;
    return Number.isInteger(cut) ? String(cut) : cut.toFixed(1);
  }

  static unscoredNote(score) {
    return score.unscored.length
      ? ` — ${score.unscored.join(' and ')} not scored, so the total is out of ${score.denominator}`
      : '';
  }

  /**
   * Why this number is not the number anyone is selling.
   *
   * Never a percentage, never a grade, never a threshold: a measurement converted into a
   * verdict about hiring outcomes is a claim this repository cannot support, and `AGENTS.md`
   * forbids it.
   */
  static disclaimer(score) {
    return [
      'This number is computed by this repository from the table at the foot of this page. No',
      'vendor produces it, no applicant tracking system uses it, and no employer will ever see',
      'it. It is comparable with itself over time and with nothing else.',
      '',
      'It models **one** parser: the strictest naive reading of the text layer, with no layout',
      'analysis at all. Real parsers do better. Treat it as a floor, not a prediction.',
      '',
      score.unscored.includes('advert')
        ? 'No advert was given, so the advert band is unscored. It is **not** rescaled: a missing input must not read as a pass.'
        : 'An advert was given, so every band is scored.',
      '',
      'On what an applicant tracking system actually does: 92% of 25 recruiters surveyed in',
      'September–October 2025 reported that their system does not auto-reject on résumé content,',
      'and all of them used knockout questions, which are answered on the application form',
      '[B, vendor-run, n=25]. The widely repeated "75% of résumés are auto-rejected" figure',
      'traces to a 2012 sales pitch with no published method; it is not repeated here.'
    ];
  }

  static row({ artefact, diff }) {
    const tick = (value) => (value ? 'yes' : 'no');
    const worst = (verdicts) =>
      LADDER[Math.max(...verdicts.map((verdict) => LADDER.indexOf(verdict)), 0)];
    return (
      `| ${artefact} | ${worst(Object.values(diff.identity))} | ` +
      `${diff.segmentation} | ${worst(diff.experience.map((role) => role.title))} | ` +
      `${diff.links.filter((link) => link.recovered).length}/${diff.links.length} | ` +
      `${tick(diff.experience.every((role) => role.tripleAdjacent) && diff.roleOrderMonotonic)} |`
    );
  }

  /**
   * The floors, per artefact and per reading order.
   *
   * The table above is scored on poppler's order alone. The floors are checked in the content stream's
   * order too, and a failure there is printed under that order's name rather than folded into the
   * other: a reader must be able to tell which extractor the document failed.
   * @param {Array<{artefact: string, floors?: {default: string[], raw: string[]}}>} results - Per artefact
   * @returns {string[]} Markdown lines, none when no floors were checked
   */
  static floorsSection(results) {
    const checked = results.filter((entry) => entry.floors);
    if (!checked.length) return [];
    const cell = (failures) => (failures.length ? `FAIL: ${failures.join('; ')}` : 'pass');
    return [
      '## Floors, in both reading orders',
      '',
      "Four failures gate the audit whatever the number says: a document that did not segment, a lost email, a role severed from its title or period, and a chronology that does not run one way. Each is checked in poppler's reading order (`pdftotext`) and in content-stream order (`pdftotext -raw`), which PDFBox and Tika read by default.",
      '',
      "| Artefact | Poppler's order | Content-stream order |",
      '|---|---|---|',
      ...checked.map(
        ({ artefact, floors }) => `| ${artefact} | ${cell(floors.default)} | ${cell(floors.raw)} |`
      )
    ];
  }

  /** Everything that did not come back, quoted so the parser can be audited rather than trusted. */
  static findings(results) {
    const lines = ['## What did not come back', ''];
    let any = false;
    for (const { artefact, diff } of results) {
      const problems = [];
      for (const [field, verdict] of Object.entries(diff.identity)) {
        if (verdict !== 'exact' && verdict !== 'normalised') problems.push(`${field}: ${verdict}`);
      }
      for (const link of diff.links.filter((entry) => !entry.recovered)) {
        problems.push(`link not in the text layer: ${link.url}`);
      }
      for (const name of diff.unexpected.skillCategories) {
        problems.push(`a category nobody wrote: "${name}"`);
      }
      if (diff.sections.missing.length)
        problems.push(`sections not recognised: ${diff.sections.missing.join(', ')}`);
      if (!diff.roleOrderMonotonic) problems.push('the chronology does not run one way');
      if (diff.experience.some((role) => !role.tripleAdjacent))
        problems.push('a role lost its title, employer or period');

      if (problems.length) {
        any = true;
        lines.push(`**${artefact}**`, '', ...problems.map((problem) => `- ${problem}`), '');
      }
    }
    if (!any) lines.push('Nothing. Every field the document writes came back in its own slot.', '');
    return lines;
  }
}

import { RecoveryDiff } from '../../core/RecoveryDiff.js';

/**
 * The rules of `npm run audit:ats:base` (#181), with no git, no browser and no file in them, so each can be shown to
 * fail.
 *
 * `audit:ats` grades the print with this repository's parser. A change to both the CV and that parser is graded by the
 * parser it changed, and can pass because the grader moved: pull request #179 first added " · 60 ECTS" after the Pisa
 * school line and widened the parser to read it, and "Recoverability 80/80" held while the base branch's parser read
 * the school as "Development". So a change that touches both is read again by the base branch's parser.
 */

/** The parser `audit:ats` grades the print with, whose imports make up the rest of it. */
export const PARSER = 'core/AtsTextParser.js';

/** The heading AGENTS.md lists what renders the CV under, for the product review. */
const PRODUCT_REVIEW = /^###\s+When the product review runs\s*$/m;

/** Inline code that reads as a path: a slash or a file extension, and nothing a path would not hold. */
const PATH = /^[\w.@-]+(\/[\w.@-]*)*$/;

/**
 * The paths AGENTS.md's product review runs on, read from the first paragraph under its heading: the one list of what
 * renders the CV, so the step and the review can never disagree about it.
 * @param {string} markdown - AGENTS.md
 * @returns {string[]} The paths, a directory ending in `/`; none when the section is not there
 */
export function productReviewPaths(markdown) {
  const heading = PRODUCT_REVIEW.exec(String(markdown ?? ''));
  if (!heading) return [];
  const after = markdown.slice(heading.index + heading[0].length).replace(/^\s*\n/, '');
  const paragraph = after.split(/\n\s*\n/)[0];
  return [
    ...new Set(
      [...paragraph.matchAll(/`([^`\n]+)`/g)]
        .map(([, code]) => code.trim())
        .filter((code) => PATH.test(code))
        .filter((code) => code.includes('/') || /\.\w+$/.test(code))
    )
  ];
}

/**
 * The changed files a set of paths holds: a path ending in `/` holds everything under it, any other only itself.
 * @param {string[]} changed - Changed files, relative to the repository root
 * @param {string[]} paths - Files and directories
 * @returns {string[]} The changed files among them, in the order given
 */
export function within(changed, paths) {
  return changed.filter((file) =>
    paths.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path))
  );
}

/**
 * Whether a change touches both the parser and what renders the CV, and why.
 *
 * Only both is a question for the base branch's parser. A change to the parser alone reads the same print the base's
 * parser read; a change to the print alone is read by `audit:ats` with the base's own parser, since it is unchanged.
 * @param {string[]} changed - The files `base...HEAD` changes
 * @param {{ parser: string[], rendering: string[] }} sets - The parser's modules, and the paths that render the CV
 * @returns {{ applies: boolean, parser: string[], rendering: string[], reason: string }} The decision
 */
export function applicability(changed, { parser, rendering }) {
  const touched = { parser: within(changed, parser), rendering: within(changed, rendering) };
  const list = (files) => files.join(', ');
  const reason =
    touched.parser.length && touched.rendering.length
      ? `it changes the parser (${list(touched.parser)}) and what renders the CV (${list(touched.rendering)})`
      : touched.parser.length
        ? `it changes the parser (${list(touched.parser)}) but nothing that renders the CV, so the print is the one the base's parser already reads`
        : touched.rendering.length
          ? `it changes what renders the CV (${list(touched.rendering)}) but not the parser, so audit:ats already reads this print with the base's parser`
          : 'it changes neither the parser nor what renders the CV';
  return {
    applies: Boolean(touched.parser.length && touched.rendering.length),
    ...touched,
    reason
  };
}

/** How much of a field came back, on the diff's ladder; `held` and `broken` are a structure's two states. */
const LADDER = { exact: 3, normalised: 3, held: 3, partial: 2, wrong: 1, lost: 0, broken: 0 };

/** The diff's names for a section, as the ATS report names them. */
const SECTION_NAMES = { spokenLanguages: 'languages' };

/** A structure's state as a verdict. */
const structure = (kept) => (kept ? 'held' : 'broken');

/**
 * Every field a recovered CV was graded on, as one list in reading order: the verdicts the audit's diff gives, the
 * degree's period, which the diff does not grade, and the structure the floors and the score read.
 *
 * The degree's period is graded here with the diff's own ladder because the loss #181 exists for is one: the base's
 * parser gave the Pisa programme no period on #179's first print. A degree that writes no period has none to lose.
 * @param {Object} diff - A RecoveryDiff result
 * @param {Object} document - The CvDocument it was graded against
 * @param {Object} recovered - The RecoveredCv it graded
 * @returns {{ key: string, label: string, verdict: string, written: *, recovered: * }[]} One entry a field
 */
export function fieldVerdicts(diff, document, recovered) {
  const fields = [];
  const evidence = (path) => diff.evidence?.[path] ?? { written: null, recovered: null };
  const add = (key, label, verdict, values = evidence(key)) =>
    fields.push({
      key,
      label,
      verdict,
      written: values.written ?? null,
      recovered: values.recovered ?? null
    });
  const entries = (part, each) =>
    (diff[part] || []).forEach((entry, index) =>
      each(entry, index, (field) => ({
        key: `${part}.${index}.${field}`,
        label: `${SECTION_NAMES[part] ?? part} ${index + 1}, ${field}`
      }))
    );
  const graded = (entry, name, at) => {
    if (entry?.[name] === undefined) return;
    const { key, label } = at(name);
    add(key, label, entry[name]);
  };

  add('segmentation', 'segmentation', structure(diff.segmentation === 'ok'), {});
  for (const [name, verdict] of Object.entries(diff.identity || {}))
    add(`identity.${name}`, name, verdict);
  for (const link of diff.links || [])
    add(`link.${link.url}`, `link ${link.url}`, structure(link.recovered), {});
  for (const name of diff.sections?.expected || [])
    add(`heading.${name}`, `${name} heading`, structure(diff.sections.found.includes(name)), {});

  entries('experience', (role, index, at) => {
    for (const name of ['title', 'employer', 'period', 'highlights']) graded(role, name, at);
    const { key } = at('together');
    add(
      key,
      `experience ${index + 1}, title, employer and period together`,
      structure(role.tripleAdjacent),
      {}
    );
  });
  add('chronology', 'chronology', structure(diff.roleOrderMonotonic), {});

  entries('education', (degree, index, at) => {
    graded(degree, 'degree', at);
    graded(degree, 'school', at);
    const written = document.education?.[index]?.period;
    if (written !== null && written !== undefined && String(written).trim()) {
      const got = recovered.education?.[index]?.period ?? null;
      const { key, label } = at('period');
      add(key, label, RecoveryDiff.verdict(String(written), got), { written, recovered: got });
    }
    const { key } = at('together');
    add(key, `education ${index + 1}, degree beside its school`, structure(degree.adjacent), {});
  });

  entries('skills', (group, index, at) => {
    graded(group, 'category', at);
    const { key } = at('attached');
    add(key, `skills ${index + 1}, items with their category`, structure(group.attached), {});
  });
  entries('spokenLanguages', (language, index, at) => {
    graded(language, 'name', at);
    graded(language, 'level', at);
  });
  entries('certifications', (certification, index, at) => graded(certification, 'name', at));
  return fields;
}

/**
 * The fields a parser recovered from one print and recovers less of from another: a lower rung on the ladder.
 *
 * Each print is graded against its own profile, so a field the change rewrote is not a loss when the new words came
 * back. A field only one print has, such as an entry the change removed, is not compared.
 * @param {ReturnType<typeof fieldVerdicts>} before - The base's parser on the base's print
 * @param {ReturnType<typeof fieldVerdicts>} after - The base's parser on the new print
 * @returns {{ key: string, label: string, from: string, to: string, was: *, now: *, written: * }[]} The losses
 */
export function lostFields(before, after) {
  const later = new Map(after.map((field) => [field.key, field]));
  return before
    .filter((field) => later.has(field.key))
    .filter((field) => LADDER[later.get(field.key).verdict] < LADDER[field.verdict])
    .map((field) => {
      const now = later.get(field.key);
      return {
        key: field.key,
        label: field.label,
        from: field.verdict,
        to: now.verdict,
        was: field.recovered,
        now: now.recovered,
        written: now.written
      };
    });
}

/** Each value in quotation marks, a list of them separated by commas, or "nothing". */
const quote = (value) =>
  value === null || value === undefined
    ? 'nothing'
    : []
        .concat(value)
        .map((item) => `"${item}"`)
        .join(', ');

/**
 * One loss as a line: what the base's parser recovered from the base's print, what it recovers from the new one, and
 * the two verdicts. A structure has nothing to quote and is named by its verdicts.
 * @param {ReturnType<typeof lostFields>[number]} loss - One loss
 * @returns {string} The line
 */
export function lossLine({ label, from, to, was = null, now = null, written = null }) {
  if (was !== null || now !== null)
    return `${label}: ${quote(was)} → ${quote(now)} (${from} → ${to})`;
  return `${label}: ${from} → ${to}${written === null ? '' : ` — written ${quote(written)}`}`;
}

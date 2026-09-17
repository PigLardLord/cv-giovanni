import { importClosure } from './import-closure.mjs';

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

/** The page's entry script: it registers the renderers, and decides what the page renders in which labels (#202). */
export const PAGE_SCRIPT = 'script.js';

/**
 * The print pipeline's entry: it serves the page and has Chrome print it, through `scripts/lib/printed-cv.mjs` and
 * `scripts/lib/print-page.mjs`, and the PDF it writes is the one `audit:ats` reads (#144, #149, #202).
 */
export const PRINT_PIPELINE = 'scripts/generate-pdfs.mjs';

/**
 * The modules that render the CV, read from their imports rather than listed by hand (#181, #202): the page's entry
 * script and every renderer, with every module they import, and the print pipeline, with every module it imports. A
 * renderer the entry script never imports still renders a page of its own, the cover letter's, so the renderers are
 * read beside it.
 *
 * The pipeline does not render the parser, though it reaches it: it prints the cover letter too, whose place line reads
 * the parser's `PlaceLexicon`. Counted, every change to that lexicon would touch the parser and what renders the CV at
 * once, and the step would run on a change to the parser alone. So a parser module the pipeline reaches counts only
 * when the page imports it as well, as it does the `DateRange` it writes its dates through.
 * @param {string[]} renderers - The renderer modules, relative to the repository root
 * @param {(path: string) => (string|null)} read - A module's source, or null when there is none
 * @param {string[]} parser - The parser's modules, which the pipeline's imports do not bring in
 * @returns {string[]} The paths, sorted
 */
export function renderingModules(renderers, read, parser) {
  const page = importClosure([PAGE_SCRIPT, ...renderers], read);
  const pipeline = importClosure([PRINT_PIPELINE], read).filter(
    (path) => page.includes(path) || !parser.includes(path)
  );
  return [...new Set([...page, ...pipeline])].sort();
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
 * Every field a recovered CV was graded on, as one list in reading order: the verdicts the audit's diff gives, and the
 * structure the floors and the score read, down to a role or a skill category nobody wrote.
 *
 * A degree's period is among the diff's verdicts: the loss #181 exists for is one, the base's parser giving the Pisa
 * programme no period on #179's first print. This step graded it itself while the diff did not; the diff grades it
 * since #200, and a degree that prints no period carries no verdict, so it has none to lose.
 * @param {Object} diff - A RecoveryDiff result
 * @returns {{ key: string, label: string, verdict: string, written: *, recovered: * }[]} One entry a field
 */
export function fieldVerdicts(diff) {
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
    for (const name of ['degree', 'school', 'period']) graded(degree, name, at);
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

  // What came back that the document never wrote: a torn category, a shredded role. The score charges for both.
  add(
    'unexpected.roles',
    'roles the document did not write',
    structure(!diff.unexpected?.roles),
    {}
  );
  add(
    'unexpected.skillCategories',
    'skill categories the document did not write',
    structure(!diff.unexpected?.skillCategories?.length),
    {}
  );
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

/**
 * The label a pull request carries when its owner accepted what the base's parser loses from the new print: a trade
 * made on purpose, recorded where the merge can see it, rather than a change the grader was moved to pass.
 */
export const TRADE_LABEL = 'ats-trade-accepted';

/**
 * A pull request's labels as the workflow hands them over: a JSON array, or a list separated by commas or lines.
 * @param {string|undefined} value - The environment variable's value
 * @returns {string[]} The label names; none when there is nothing to read
 */
export function pullRequestLabels(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (parsed === null) return [];
  } catch {
    /* not JSON: a list */
  }
  return text
    .split(/[,\n]/)
    .map((label) => label.trim())
    .filter(Boolean);
}

/**
 * How the step ends. A loss fails it, unless the pull request declares the trade accepted: the losses are still
 * reported, and the label is the record that someone read them.
 * @param {Object[]} losses - Every loss, over every print and reading order
 * @param {string[]} labels - The pull request's labels
 * @returns {{ exitCode: number, accepted: boolean }} The exit code, and whether a trade was accepted
 */
export function outcome(losses, labels) {
  if (!losses.length) return { exitCode: 0, accepted: false };
  const accepted = labels.includes(TRADE_LABEL);
  return { exitCode: accepted ? 0 : 1, accepted };
}

/**
 * The reading orders `audit:ats` extracts a print in: poppler's, which it scores; the content stream's, which PDFBox
 * and Tika read and whose floors it gates on; and poppler's layout-aware one, where it looks for a serialised column.
 * #179's first print lost the Pisa school in the first and the last, and merged both degrees in the second.
 */
export const READING_ORDERS = [
  { name: 'default', args: [], title: "Poppler's order (`pdftotext`)", short: "poppler's order" },
  {
    name: 'raw',
    args: ['-raw'],
    title: 'Content-stream order (`pdftotext -raw`)',
    short: 'content-stream order'
  },
  {
    name: 'layout',
    args: ['-layout'],
    title: 'Layout order (`pdftotext -layout`)',
    short: 'layout order'
  }
];

const orderOf = (name) => READING_ORDERS.find((order) => order.name === name);

/**
 * Every loss over every print and reading order.
 * @param {{ artefact: string, order: string, baseOnBase: Object[], baseOnHead: Object[] }[]} readings - One entry a
 *   print in one order: the base's parser on the base's print, and on the new one
 * @returns {Object[]} The losses, each with the print and the order it happened in
 */
export function readingLosses(readings) {
  return readings.flatMap(({ artefact, order, baseOnBase, baseOnHead }) =>
    lostFields(baseOnBase, baseOnHead).map((loss) => ({ artefact, order, ...loss }))
  );
}

/** Where a loss happened: the prints, by reading order. */
function where(losses) {
  const byOrder = new Map();
  for (const { artefact, order } of losses) {
    if (!byOrder.has(order)) byOrder.set(order, []);
    if (!byOrder.get(order).includes(artefact)) byOrder.get(order).push(artefact);
  }
  return [...byOrder.entries()]
    .map(([order, artefacts]) => `${artefacts.join(', ')} in ${orderOf(order)?.short ?? order}`)
    .join('; ');
}

/** One reading order's fields, a row each, beside what each parser recovered from each print. */
function table(order, readings, lost) {
  const columns = ['baseOnBase', 'baseOnHead', 'headOnHead'];
  const rows = new Map();
  for (const reading of readings) {
    for (const column of columns) {
      for (const field of reading[column]) {
        if (!rows.has(field.key)) rows.set(field.key, { label: field.label, cells: {} });
        const cells = rows.get(field.key).cells;
        cells[column] ??= new Map();
        cells[column].set(reading.artefact, field.verdict);
      }
    }
  }
  const artefacts = readings.map((reading) => reading.artefact);
  const cell = (verdicts = new Map()) => {
    const each = artefacts.map((artefact) => verdicts.get(artefact) ?? '—');
    return new Set(each).size === 1
      ? each[0]
      : artefacts.map((artefact, index) => `${artefact}: ${each[index]}`).join('; ');
  };
  return [
    `### ${order.title}`,
    '',
    '| Field | Base parser, base print | Base parser, this print | This parser, this print |',
    '|---|---|---|---|',
    ...[...rows.entries()].map(([key, { label, cells }]) => {
      const name = lost.has(`${order.name}\0${key}`) ? `**${label}**` : label;
      return `| ${name} | ${columns.map((column) => cell(cells[column])).join(' | ')} |`;
    })
  ];
}

/**
 * The step's report, in Markdown: for the job summary in CI, and printed locally.
 * @param {Object} run
 * @param {{ ref: string, commit: string }} run.base - The base it compared against
 * @param {ReturnType<typeof applicability>} run.decision - Whether it applied, and why
 * @param {Object[]} [run.readings] - As `readingLosses` takes them, with `headOnHead` beside
 * @param {Object[]} [run.losses] - What `readingLosses` returned
 * @param {string[]} [run.labels] - The pull request's labels
 * @param {number} [run.seconds] - How long the base's print took to build
 * @returns {string} The report
 */
export function report({ base, decision, readings = [], losses = [], labels = [], seconds = 0 }) {
  const heading = [
    "## What the base branch's parser recovers from this print",
    '',
    "`audit:ats` grades this print with this branch's parser, which a change can move until it passes (#181)."
  ];
  const against = `\`${base.ref}\` at \`${base.commit}\``;
  if (!decision.applies) {
    return [...heading, '', `Not compared with ${against}: ${decision.reason}.`, ''].join('\n');
  }

  const artefacts = [...new Set(readings.map((reading) => reading.artefact))];
  const orders = READING_ORDERS.filter((order) =>
    readings.some((reading) => reading.order === order.name)
  );
  const grouped = new Map();
  for (const loss of losses) {
    const line = lossLine(loss);
    if (!grouped.has(line)) grouped.set(line, []);
    grouped.get(line).push(loss);
  }
  const { accepted } = outcome(losses, labels);
  const verdict = !losses.length
    ? ["No field the base's parser recovered from the base's print is lost from this one."]
    : [
        "The base's parser recovered these fields from the base's print, and recovers less of them from this one:",
        '',
        ...[...grouped.entries()].map(([line, each]) => `- ${line} — ${where(each)}`),
        '',
        accepted
          ? `**The pull request carries \`${TRADE_LABEL}\`:** its owner accepted this trade, so the step passes.`
          : `**The step fails.** A parser change and a layout change are reviewed apart. If this trade is deliberate and the owner accepts it, the label \`${TRADE_LABEL}\` records that; a re-run reads the labels its run started with, so push again, or close and reopen the pull request, after adding it.`
      ];
  const lost = new Set(losses.map((loss) => `${loss.order}\0${loss.key}`));

  return [
    ...heading,
    '',
    `- **Base:** ${against}.`,
    `- **Why it ran:** ${decision.reason}.`,
    `- **Read:** ${artefacts.join(', ')}, in ${orders.map((order) => order.short).join(', ')}; the base's print built in ${seconds.toFixed(1)} s.`,
    '',
    '### Losses',
    '',
    ...verdict,
    '',
    ...orders.flatMap((order) => [
      ...table(
        order,
        readings.filter((reading) => reading.order === order.name),
        lost
      ),
      ''
    ])
  ].join('\n');
}

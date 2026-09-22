import { RecoveryDiff } from '../../core/RecoveryDiff.js';
import { importClosure } from './import-closure.mjs';
import { catalogueTranslator } from './printed-letter.mjs';

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

/**
 * What a print is graded with, besides the parser: the diff, which builds each line it expects with
 * `domain/EntryLines.js`, and the document model the profile is read through. Each print is graded by the branch that
 * printed it, so the base's print by the base's (#201).
 */
export const GRADER = ['core/RecoveryDiff.js', 'domain/CvDocument.js'];

/**
 * How a branch's print writes a count of credits: that branch's `creditWords`, which names its catalogue key, over that
 * branch's catalogue (#215). A key the catalogue does not hold throws, naming it, rather than reading as its own text in
 * a line the grader expects: graded against "(cv:education.scope)", a degree the print wrote whole read partial, and a
 * loss read "partial → partial".
 * @param {(t: Function, locale: string) => object} creditWords - The branch's own, from its `domain/EntryLines.js`
 * @param {object} catalogue - The branch's `locales/<locale>/cv.json`
 * @param {string} locale - The CV's language
 * @returns {{ credits: (count: string) => string, locale: string }} The words, as the grader takes them
 */
export function catalogueWords(creditWords, catalogue, locale) {
  const translate = catalogueTranslator({ cv: catalogue });
  return creditWords((key, values) => {
    const text = translate(key, values);
    if (text === key) throw new Error(`the catalogue holds no ${key}`);
    return text;
  }, locale);
}

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
 * @param {string[]} parser - The parser's modules, some of which the pipeline's imports reach and leave out here
 * @returns {string[]} The paths, sorted
 */
export function renderingModules(renderers, read, parser) {
  const page = importClosure([PAGE_SCRIPT, ...renderers], read);
  // A parser module the page imports is in `page` already, so the pipeline's own copy of it can go.
  const pipeline = importClosure([PRINT_PIPELINE], read).filter((path) => !parser.includes(path));
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

/** A verdict short of a field recovered in full. */
const short = (verdict) => verdict in LADDER && LADDER[verdict] < LADDER.exact;

/**
 * The sections a diff grades entry by entry. The diff matches what came back to what the document wrote by what it says
 * (#217), and keys each verdict by the written entry's position in its own branch's profile.
 */
const REPEATED = ['experience', 'education', 'skills', 'spokenLanguages', 'certifications'];
const ENTRY = new RegExp(`^(${REPEATED.join('|')})\\.(\\d+)\\.(.+)$`);

/** The entry a field belongs to, as its section and its place, or null for a field of the whole document. */
const entryOf = (key) => {
  const entry = ENTRY.exec(key);
  return entry ? `${entry[1]}.${entry[2]}` : null;
};

/** An entry as a label names it: its section, and its place in its own branch's profile counted from 1. */
const entryName = (section, index) => `${SECTION_NAMES[section] ?? section} ${index + 1}`;

/**
 * Each repeated section's entries a reading was graded on, in its own branch's profile's order: each entry's place,
 * what it writes in each field the diff grades, and its fields.
 * @param {ReturnType<typeof fieldVerdicts>} fields - One reading
 * @returns {Object<string, { index: number, writes: Object<string, *>, fields: Object[] }[]>} The entries, by section
 */
function entriesOf(fields) {
  const sections = Object.fromEntries(REPEATED.map((section) => [section, []]));
  for (const field of fields) {
    const entry = ENTRY.exec(field.key);
    if (!entry) continue;
    const [, section, at, name] = entry;
    const index = Number(at);
    sections[section][index] ??= { index, writes: {}, fields: [] };
    sections[section][index].writes[name] = field.written;
    sections[section][index].fields.push(field);
  }
  return Object.fromEntries(
    Object.entries(sections).map(([section, entries]) => [section, entries.filter(Boolean)])
  );
}

/**
 * Which entry of this branch's profile each entry of the base's is, told by what the two write (#221).
 *
 * Each print's diff keys an entry by its place in its own branch's profile, so the same key on the two prints names two
 * entries once a branch adds, removes or reorders one. Each entry of the base's is lined up with the entry of this
 * branch's that says the same, by `RecoveryDiff.likeness`, the rule the diff matches a recovered entry to a written one
 * by, on what each branch's own grader says its print writes: a role by its title and employer, a degree by its line and
 * school, their dates only breaking a tie, a category by its whole label, a language by its name, a certification by its
 * line. So a degree whose line a branch rewrites is still told by its school; a certification whose line it rewrites
 * past any whole-word likeness is told by nothing, and is an entry with no counterpart on each side.
 * @param {ReturnType<typeof fieldVerdicts>} before - The base's parser on the base's print, graded by the base
 * @param {ReturnType<typeof fieldVerdicts>} after - The base's parser on the new print, graded by this branch
 * @returns {{ places: Map<string, number>, alone: { base: Object[], head: Object[] } }} This branch's place for each
 *   entry of the base's lined up, keyed by section and the base's place; and the entries of each profile no entry of the
 *   other says the same as, with their section
 */
function lineUp(before, after) {
  const base = entriesOf(before);
  const head = entriesOf(after);
  const places = new Map();
  const alone = { base: [], head: [] };
  for (const section of REPEATED) {
    const { matched, unmatched } = RecoveryDiff.match(base[section], head[section], (was, now) =>
      RecoveryDiff.likeness(section, was.writes, now.writes)
    );
    base[section].forEach((entry, at) => {
      if (matched[at]) places.set(`${section}.${entry.index}`, matched[at].index);
      else alone.base.push({ section, ...entry });
    });
    alone.head.push(...unmatched.map((entry) => ({ section, ...entry })));
  }
  return { places, alone };
}

/**
 * The base's reading, each entry's fields keyed and labelled by the place of the entry of this branch's profile it lines
 * up with (#221), so a field is compared with the same entry's on the new print. A field of an entry that lines up with
 * none is left out; a field of the whole document is kept as it is. A field whose entry sits elsewhere in the base's
 * profile says where, as `moved`.
 * @param {ReturnType<typeof fieldVerdicts>} before - The base's parser on the base's print, graded by the base
 * @param {ReturnType<typeof fieldVerdicts>} after - The base's parser on the new print, graded by this branch
 * @returns {(ReturnType<typeof fieldVerdicts>[number] & { moved?: string })[]} The base's reading, in this branch's places
 */
export function inHeadPlaces(before, after) {
  const { places } = lineUp(before, after);
  return before.flatMap((field) => {
    const entry = ENTRY.exec(field.key);
    if (!entry) return [field];
    const [, section, at, name] = entry;
    const index = places.get(`${section}.${at}`);
    if (index === undefined) return [];
    if (index === Number(at)) return [field];
    return [
      {
        ...field,
        key: `${section}.${index}.${name}`,
        label: field.label.replace(entryName(section, Number(at)), entryName(section, index)),
        moved: entryName(section, Number(at))
      }
    ];
  });
}

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
 * Each print is graded against its own branch's profile and lines (#201), so a field the change rewrote is not a loss
 * when the new words came back. An entry's field is compared with the same field of the entry of the other profile that
 * says the same, not of the entry at the same place (#221), and is named by its place in this branch's profile: a
 * section a branch adds an entry to, removes one from or reorders is compared entry by entry like any other. A field
 * only one print has, such as one the base's grader does not grade, or one of an entry the other profile has no
 * counterpart for, is not compared; `unmatchedEntries` answers for the second.
 * @param {ReturnType<typeof fieldVerdicts>} before - The base's parser on the base's print, graded by the base
 * @param {ReturnType<typeof fieldVerdicts>} after - The base's parser on the new print, graded by this branch
 * @returns {{ key: string, label: string, from: string, to: string, was: *, now: *, written: *, before: *,
 *   moved?: string }[]} The losses: what the base's parser recovered from each print, what the new print writes, what
 *   the base's wrote, and where the base's profile has the entry when that is elsewhere
 */
export function lostFields(before, after) {
  const later = new Map(after.map((field) => [field.key, field]));
  return inHeadPlaces(before, after)
    .filter((field) => later.has(field.key))
    .filter((field) => LADDER[later.get(field.key).verdict] < LADDER[field.verdict])
    .map((field) => {
      const now = later.get(field.key);
      return {
        key: field.key,
        label: now.label,
        from: field.verdict,
        to: now.verdict,
        was: field.recovered,
        now: now.recovered,
        written: now.written,
        before: field.written,
        ...(field.moved ? { moved: field.moved } : {})
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
 * the two verdicts. A structure has nothing to quote and is named by its verdicts. An entry is named by its place in
 * this branch's profile, and by its place in the base's too when the two differ (#221).
 *
 * Each print is graded against its own branch's words (#201), so the same text can come back from both and grade lower
 * on the new print: when the new print writes the field otherwise than the base's did, the line says what it writes.
 * @param {ReturnType<typeof lostFields>[number]} loss - One loss
 * @returns {string} The line
 */
export function lossLine({
  label,
  from,
  to,
  was = null,
  now = null,
  written = null,
  before,
  moved
}) {
  const named = moved ? `${label} (${moved} in the base's profile)` : label;
  if (was !== null || now !== null) {
    const rewritten =
      before !== undefined && written !== null && quote(written) !== quote(before)
        ? ` — this print writes ${quote(written)}`
        : '';
    return `${named}: ${quote(was)} → ${quote(now)} (${from} → ${to})${rewritten}`;
  }
  return `${named}: ${from} → ${to}${written === null ? '' : ` — written ${quote(written)}`}`;
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
 *
 * An entry it could not compare, one of this branch's profile that no entry of the base's says the same as and that the
 * base's parser reads some of short from the new print, ends it with 2, as a comparison that did not happen does: an
 * entry the parser misreads and one of the base's that the branch rewrote and the parser now loses read alike there, so
 * nobody read a loss the label could accept.
 * @param {Object[]} losses - Every loss, over every print and reading order
 * @param {string[]} labels - The pull request's labels
 * @param {ReturnType<typeof readingsUnmatched>} [unmatched] - The entries with no counterpart, over every reading
 * @returns {{ exitCode: number, accepted: boolean }} The exit code, and whether a trade was accepted
 */
export function outcome(losses, labels, unmatched = []) {
  if (unmatched.some((section) => section.short.length)) return { exitCode: 2, accepted: false };
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
 * One print pair, in one reading order, read and graded as the step compares them.
 *
 * The base's parser reads both prints. Each print is graded by the branch that printed it: the base's print against the
 * base's profile, by the base's diff, whose `EntryLines` wrote its lines, in the base's catalogue's words; the new print
 * against this branch's. Graded by this branch alone, a change that rewords a line held the base's print to the new
 * words, graded it partial where it was exact, and a loss on the new print read "partial → partial" (#201).
 * @param {{ base: string, head: string }} texts - The base's print and the new one, in the same order
 * @param {Object} sides - Each branch's `parser`, `grader` (a `RecoveryDiff`), `document` and `words`
 * @returns {{ baseOnBase: Object[], baseOnHead: Object[], headOnHead: Object[] }} The base's parser on each print, and
 *   this branch's on its own, as `fieldVerdicts` lists them
 */
export function gradedReadings(texts, { base, head }) {
  const grade = (parser, text, { grader, document, words }) =>
    fieldVerdicts(grader.diff(document, parser.parse(text), { words }));
  return {
    baseOnBase: grade(base.parser, texts.base, base),
    baseOnHead: grade(base.parser, texts.head, head),
    headOnHead: grade(head.parser, texts.head, head)
  };
}

/**
 * The entries of either profile that no entry of the other says the same as (#221), with every field of this branch's
 * the base's parser reads short from the new print.
 *
 * Lined up by what they say, the entries of a section a branch adds to, removes from or reorders are compared entry by
 * entry, where #216 compared none of a section numbered differently. What is left is an entry with no counterpart. One
 * of the base's profile is not on the new print, and has nothing on it to lose. One of this branch's the base's parser
 * reads in full from the new print lost nothing. One it reads any of short has nothing to be compared with: it may be an
 * entry the base's parser always misread, or one of the base's that the branch rewrote past recognition and the parser
 * now loses, and the two read alike.
 * @param {ReturnType<typeof fieldVerdicts>} before - The base's parser on the base's print, graded by the base
 * @param {ReturnType<typeof fieldVerdicts>} after - The base's parser on the new print, graded by this branch
 * @returns {{ section: string, profile: 'head'|'base', index: number, name: string, writes: string[],
 *   short: { key: string, label: string, verdict: string }[] }[]} Each entry: its section, the profile it is in and its
 *   place there, what identifies it, and the fields read short from the new print, none for one of the base's
 */
export function unmatchedEntries(before, after) {
  const { alone } = lineUp(before, after);
  const described = (profile, { section, index, writes, fields }) => ({
    section,
    profile,
    index,
    name: entryName(section, index),
    writes: RecoveryDiff.identifying(section)
      .map((field) => writes[field])
      .filter((value) => value !== null && value !== undefined && value !== ''),
    short:
      profile === 'head'
        ? fields
            .filter((field) => short(field.verdict))
            .map(({ key, label, verdict }) => ({ key, label, verdict }))
        : []
  });
  return [
    ...alone.head.map((entry) => described('head', entry)),
    ...alone.base.map((entry) => described('base', entry))
  ];
}

/**
 * Every entry with no counterpart, over every print and reading order.
 * @param {{ artefact: string, order: string, baseOnBase: Object[], baseOnHead: Object[] }[]} readings - As
 *   `readingLosses` takes them
 * @returns {Object[]} The entries, each with the print and the order it was read in
 */
export function readingsUnmatched(readings) {
  return readings.flatMap(({ artefact, order, baseOnBase, baseOnHead }) =>
    unmatchedEntries(baseOnBase, baseOnHead).map((entry) => ({ artefact, order, ...entry }))
  );
}

/**
 * The fields the new print was graded on that the base's print carries no verdict for, of an entry lined up with one of
 * the base's or of the whole document: the base's grader does not grade them, as a base from before #200 grades no
 * degree's period, or the base's entry does not write them. None can be compared, so none is a loss; each is named, so
 * a field left uncompared is not mistaken for one that held. A field of an entry with no counterpart is
 * `unmatchedEntries`' to name.
 * @param {{ artefact: string, order: string, baseOnBase: Object[], baseOnHead: Object[] }[]} readings - As
 *   `readingLosses` takes them
 * @returns {{ artefact: string, order: string, key: string, label: string }[]} The fields, with the print and the order
 */
export function notGradedOnBase(readings) {
  return readings.flatMap(({ artefact, order, baseOnBase, baseOnHead }) => {
    const graded = new Set(inHeadPlaces(baseOnBase, baseOnHead).map((field) => field.key));
    const alone = new Set(
      unmatchedEntries(baseOnBase, baseOnHead)
        .filter((entry) => entry.profile === 'head')
        .map(({ section, index }) => `${section}.${index}`)
    );
    return baseOnHead
      .filter((field) => !graded.has(field.key) && !alone.has(entryOf(field.key)))
      .map(({ key, label }) => ({ artefact, order, key, label }));
  });
}

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

/**
 * One reading order's fields, a row each, beside what each parser recovered from each print. A row is a field of this
 * branch's profile, in its order, and the base's column reads the entry of the base's profile it lines up with (#221).
 */
function table(order, readings, lost) {
  const columns = ['baseOnBase', 'baseOnHead', 'headOnHead'];
  const rows = new Map();
  for (const reading of readings) {
    const fields = {
      ...reading,
      baseOnBase: inHeadPlaces(reading.baseOnBase, reading.baseOnHead)
    };
    for (const column of ['baseOnHead', 'headOnHead', 'baseOnBase']) {
      for (const field of fields[column]) {
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
  const unmatched = readingsUnmatched(readings);
  const { accepted, exitCode } = outcome(losses, labels, unmatched);
  const uncompared = exitCode === 2;
  const verdict = [
    ...(!losses.length
      ? [
          uncompared
            ? "No field the base's parser could compare is lost from this print, but not every entry could be compared: see _Not compared_."
            : "No field the base's parser recovered from the base's print is lost from this one."
        ]
      : [
          "The base's parser recovered these fields from the base's print, and recovers less of them from this one:",
          '',
          ...[...grouped.entries()].map(([line, each]) => `- ${line} — ${where(each)}`)
        ]),
    ...(uncompared
      ? [
          '',
          `**The step fails: it could not compare every entry.** The base's parser reads short an entry no entry of the base's profile says the same as, where an entry it misreads and one of the base's it now loses read alike: check those fields by hand. The label \`${TRADE_LABEL}\` accepts a loss someone could read, not a comparison that did not happen, so add or rewrite the entries in one pull request and change the parser in another.`
        ]
      : losses.length
        ? [
            '',
            accepted
              ? `**The pull request carries \`${TRADE_LABEL}\`:** its owner accepted this trade, so the step passes.`
              : `**The step fails.** A parser change and a layout change are reviewed apart. If this trade is deliberate and the owner accepts it, the label \`${TRADE_LABEL}\` records that; a re-run reads the labels its run started with, so push again, or close and reopen the pull request, after adding it.`
          ]
        : [])
  ];
  const entries = new Map();
  for (const each of unmatched) {
    const at = `${each.profile}\0${each.section}\0${each.index}\0${quote(each.writes)}`;
    if (!entries.has(at)) entries.set(at, { ...each, short: new Map() });
    for (const field of each.short) {
      const line = `${field.label} (${field.verdict})`;
      if (!entries.get(at).short.has(line)) entries.get(at).short.set(line, []);
      entries.get(at).short.get(line).push(each);
    }
  }
  const notCompared = entries.size
    ? [
        '### Not compared',
        '',
        'Each entry is compared with the entry of the other profile that says the same (#221). These say what no entry of the other profile says, so nothing is compared with them.',
        '',
        ...[...entries.values()].flatMap(({ profile, name, writes, short: fields }) => {
          const named = `- **${name}** of ${profile === 'head' ? "this branch's" : "the base's"} profile${writes.length ? `, ${quote(writes)}` : ''}:`;
          if (profile === 'base')
            return [
              `${named} no entry of this branch's profile says the same, so this print has nothing of it to lose.`
            ];
          const counterpart = `${named} no entry of the base's profile says the same.`;
          return fields.size
            ? [
                `${counterpart} The base's parser reads these short from this print, and the step cannot tell an entry it misreads from one of the base's it now loses:`,
                ...[...fields.entries()].map(([line, each]) => `  - ${line} — ${where(each)}`)
              ]
            : [
                `${counterpart} The base's parser reads all of it in full from this print, so nothing in it was lost.`
              ];
        }),
        ''
      ]
    : [];
  const lost = new Set(losses.map((loss) => `${loss.order}\0${loss.key}`));
  const ungraded = new Map();
  for (const field of notGradedOnBase(readings)) {
    if (!ungraded.has(field.label)) ungraded.set(field.label, []);
    ungraded.get(field.label).push(field);
  }
  const notGraded = ungraded.size
    ? [
        '### Not graded on the base',
        '',
        "The base's print carries no verdict for these fields: the base's grader does not grade them, or the base's profile does not write them. They are not compared, and none is a loss.",
        '',
        ...[...ungraded.entries()].map(([label, each]) => `- ${label} — ${where(each)}`),
        ''
      ]
    : [];

  return [
    ...heading,
    '',
    `- **Base:** ${against}.`,
    `- **Why it ran:** ${decision.reason}.`,
    `- **Read:** ${artefacts.join(', ')}, in ${orders.map((order) => order.short).join(', ')}; the base's print built in ${seconds.toFixed(1)} s.`,
    "- **Graded:** the base's print against the base's own lines — its `RecoveryDiff`, `EntryLines` and catalogue — and this print against this branch's (#201).",
    "- **Lined up:** each entry of this branch's profile is compared with the entry of the base's that says the same, and named by its place in this branch's profile (#221).",
    '',
    '### Losses',
    '',
    ...verdict,
    '',
    ...notCompared,
    ...notGraded,
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

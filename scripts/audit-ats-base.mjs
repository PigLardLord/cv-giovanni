import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { GenerationTarget } from '../core/GenerationTarget.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { CvDocument } from '../domain/CvDocument.js';
import {
  applicability,
  fieldVerdicts,
  outcome,
  PARSER,
  productReviewPaths,
  pullRequestLabels,
  READING_ORDERS,
  readingLosses,
  renderingModules,
  report
} from './lib/base-parser.mjs';
import { importClosure } from './lib/import-closure.mjs';
import { builtCv } from './lib/printed-cv.mjs';
import { catalogueTranslator } from './lib/printed-letter.mjs';

/**
 * The base branch's parser, reading the new print (#181).
 *
 * `audit:ats` grades the print with this branch's parser. A change to both the CV and that parser is graded by the
 * parser it changed, and passes when the grader moved: pull request #179 first added " · 60 ECTS" after the Pisa
 * school line and widened the parser to read it, and "Recoverability 80/80" held while the base's parser read the
 * school as "Development" and gave it no period.
 *
 * So when a change since the merge base touches the parser and what renders the CV, this builds the base's print in a temporary
 * worktree, reads it and this branch's print with the base's parser in every order `audit:ats` reads, and fails on a
 * field the base's parser recovered from its own print and recovers less of from this one — unless the pull request
 * carries `ats-trade-accepted`. Otherwise it says why it did not apply, and exits 0.
 *
 * Exit codes: 0 compared and nothing lost, a trade accepted, or not applicable; 1 a loss; 2 nothing was compared.
 */
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const target = GenerationTarget.fromArguments([]);
const cleanups = [];
const cleanUp = () => {
  while (cleanups.length) {
    try {
      cleanups.pop()();
    } catch (error) {
      console.error(`audit-ats-base: could not clean up — ${error.message}`);
    }
  }
};
process.on('exit', cleanUp);
// A signal ends the process without 'exit' unless it is handled, and it most often arrives while npm builds the base in
// its worktree: exit through the handler, so the worktree and the directory are removed (the code review of #203).
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

/** Stop, having said what was not compared. A comparison that did not run must not read as a pass. */
function cannotCheck(reason, hint) {
  console.error(`audit-ats-base: ${reason} — nothing was compared.`);
  if (hint) console.error(hint);
  process.exit(2);
}

const git = (args, options = {}) =>
  execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });

// The base: --base=<ref>, else the pull request's base branch as the workflow names it, else origin/main. What is built
// and read is the merge base, the commit `base...HEAD` diffs against, so a base branch that moved on since does not
// bring changes this branch never saw into the comparison.
const ref =
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--base='))
    ?.slice(7) ||
  (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
let commit;
try {
  commit = git(['merge-base', ref, 'HEAD']).trim();
} catch {
  cannotCheck(
    `cannot find where HEAD left ${ref}`,
    'Fetch the base branch and run again: the workflow checks out with fetch-depth: 0.'
  );
}
const base = { ref, commit: commit.slice(0, 7) };

const readHead = (path) =>
  existsSync(join(projectRoot, path)) ? readFileSync(join(projectRoot, path), 'utf8') : null;
const readBase = (path) => {
  try {
    return git(['show', `${commit}:${path}`]);
  } catch {
    return null;
  }
};
const modules = (names) => names.filter((name) => /\.m?js$/.test(name));

// What each side is made of, read on both sides: a module the change added to the parser, or took out of it, counts.
const reviewed = productReviewPaths(readHead('AGENTS.md'));
if (!reviewed.length) {
  cannotCheck(
    "AGENTS.md names no paths under its product review's heading, so what renders the CV is unknown",
    'The step reads the paragraph under "### When the product review runs".'
  );
}
const union = (...lists) => [...new Set(lists.flat())].sort();
const parserModules = {
  head: importClosure([PARSER], readHead),
  base: importClosure([PARSER], readBase)
};
const renderers = {
  head: modules(readdirSync(join(projectRoot, 'renderers')).map((name) => `renderers/${name}`)),
  base: modules(git(['ls-tree', '--name-only', commit, 'renderers/']).split('\n').filter(Boolean))
};
const sets = {
  parser: union(parserModules.head, parserModules.base),
  rendering: union(
    reviewed,
    renderingModules(renderers.head, readHead),
    renderingModules(renderers.base, readBase)
  )
};
// What the checkout changes since the merge base, committed or not: `base...HEAD` in CI, where the two are the same, and
// locally the files build:pdf printed and this script imports, which are the working tree's.
const lines = (text) => text.split('\n').filter(Boolean);
const changed = [
  ...new Set([
    ...lines(git(['diff', '--name-only', '--no-renames', commit])),
    ...lines(git(['ls-files', '--others', '--exclude-standard']))
  ])
].sort();
const decision = applicability(changed, sets);

/** The report, printed, and added to the job's summary in CI. */
const publish = (text) => {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

if (!decision.applies) {
  publish(report({ base, decision }));
  process.exit(0);
}

try {
  execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
} catch {
  cannotCheck('pdftotext is not installed', 'Install poppler-utils and run again.');
}

const layouts = (root) =>
  JSON.parse(readFileSync(join(root, 'config/cv-manifest.json'), 'utf8')).layouts;
const headData = JSON.parse(readHead(target.dataPath));
const head = builtCv(target, headData, layouts(projectRoot), (path) =>
  existsSync(join(projectRoot, path))
);
if (head.missing.length) {
  cannotCheck(
    `${head.missing.join(', ')} not built`,
    'Run `npm run build:pdf` first: this reads the print it wrote.'
  );
}

/** A print's text in every reading order `audit:ats` reads. */
const texts = (path) =>
  Object.fromEntries(
    READING_ORDERS.map((order) => [
      order.name,
      execFileSync('pdftotext', [...order.args, path, '-'], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      })
    ])
  );

const scratch = mkdtempSync(join(tmpdir(), 'audit-ats-base-'));
cleanups.push(() => rmSync(scratch, { recursive: true, force: true }));

// The base's parser, alone: every module it imports, at the base's commit, where its relative imports still resolve.
// A module the closure missed fails the import here, rather than being read from this branch.
const parserRoot = join(scratch, 'parser');
for (const path of parserModules.base) {
  const source = readBase(path);
  if (source === null)
    cannotCheck(`${path}, which the base's parser imports, is not in ${base.commit}`);
  mkdirSync(dirname(join(parserRoot, path)), { recursive: true });
  writeFileSync(join(parserRoot, path), source);
}
writeFileSync(join(parserRoot, 'package.json'), '{ "type": "module" }\n');
const { AtsTextParser: BaseParser } = await import(pathToFileURL(join(parserRoot, PARSER)).href);

// The base's print, built by the base's own build in a worktree of its own.
const worktree = join(scratch, 'base');
const started = performance.now();
try {
  git(['worktree', 'add', '--detach', worktree, commit]);
} catch (error) {
  cannotCheck(
    `cannot check out ${base.commit} in a worktree`,
    error.stderr?.toString() || error.message
  );
}
// Removed by its path, never by a prune: a prune would also drop the records of other worktrees whose directories are
// gone, and those are not this script's to drop.
cleanups.push(() => git(['worktree', 'remove', '--force', worktree]));
// The dependencies this checkout installed serve the base when both lock the same ones; otherwise the base installs its
// own. The link is removed before the worktree is, so removing it can never reach into this checkout's modules.
const sameDependencies =
  spawnSync('git', ['diff', '--quiet', commit, '--', 'package-lock.json'], {
    cwd: projectRoot
  }).status === 0;
const baseModules = join(worktree, 'node_modules');
if (sameDependencies && existsSync(join(projectRoot, 'node_modules'))) {
  symlinkSync(join(projectRoot, 'node_modules'), baseModules, 'dir');
  cleanups.push(() => {
    if (lstatSync(baseModules, { throwIfNoEntry: false })?.isSymbolicLink())
      unlinkSync(baseModules);
  });
} else {
  console.error(`audit-ats-base: ${base.commit} locks other dependencies; installing them.`);
  const install = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: worktree,
    stdio: ['ignore', 2, 2]
  });
  if (install.status !== 0) cannotCheck(`npm ci exited ${install.status} in the base's worktree`);
}
const building = performance.now();
const build = spawnSync('npm', ['run', 'build:pdf'], { cwd: worktree, stdio: ['ignore', 2, 2] });
const seconds = (performance.now() - building) / 1000;
if (build.status !== 0) {
  cannotCheck(
    `the base's build:pdf exited ${build.status}`,
    'It needs the browser this branch builds with: CHROME_PATH.'
  );
}
console.error(
  `audit-ats-base: built ${base.commit}'s print in ${seconds.toFixed(1)} s (${((performance.now() - started) / 1000).toFixed(1)} s with the worktree).`
);

const baseData = JSON.parse(readFileSync(join(worktree, target.dataPath), 'utf8'));
const baseDirectory = join(worktree, target.outDir);
const basePdfs = existsSync(baseDirectory) ? readdirSync(baseDirectory) : [];
const pairs = head.files
  .map(({ layout, filename, path }) => {
    const match =
      basePdfs.find((name) => name === filename) ||
      basePdfs.find((name) => name.endsWith(`-${layout}.pdf`) && !/-cover(-|\.)/.test(name));
    return match && { layout, head: join(projectRoot, path), base: join(baseDirectory, match) };
  })
  .filter(Boolean);
if (!pairs.length)
  cannotCheck(
    `the base's build wrote no print for ${head.files.map((file) => file.layout).join(', ')}`
  );
for (const file of head.files.filter(
  (file) => !pairs.some((pair) => pair.layout === file.layout)
)) {
  console.error(`audit-ats-base: the base printed no ${file.layout} layout; it is not compared.`);
}
const printed = pairs.map((pair) => ({
  ...pair,
  baseText: texts(pair.base),
  headText: texts(pair.head)
}));
const baseCatalogue = JSON.parse(
  readFileSync(join(worktree, `locales/${target.locale}/cv.json`), 'utf8')
);
cleanUp();

// Each print is graded against its own profile, in its own catalogue's words, by this branch's diff: only the parser
// differs between the base's print and this one.
const wordsOf = (catalogue) => {
  const t = catalogueTranslator({ cv: catalogue });
  return { locale: target.locale, credits: (count) => t('cv:education.credits', { count }) };
};
const sides = {
  base: { document: new CvDocument(baseData), words: wordsOf(baseCatalogue) },
  head: {
    document: new CvDocument(headData),
    words: wordsOf(JSON.parse(readHead(`locales/${target.locale}/cv.json`)))
  }
};
const grade = (Parser, text, { document, words }) => {
  const recovered = Parser.parse(text);
  return fieldVerdicts(RecoveryDiff.diff(document, recovered, { words }), document, recovered);
};

const readings = printed.flatMap(({ layout, baseText, headText }) =>
  READING_ORDERS.map((order) => ({
    artefact: layout,
    order: order.name,
    baseOnBase: grade(BaseParser, baseText[order.name], sides.base),
    baseOnHead: grade(BaseParser, headText[order.name], sides.head),
    headOnHead: grade(AtsTextParser, headText[order.name], sides.head)
  }))
);
const losses = readingLosses(readings);
const labels = pullRequestLabels(process.env.PULL_REQUEST_LABELS);
const { exitCode, accepted } = outcome(losses, labels);

publish(report({ base, decision, readings, losses, labels, seconds }));
if (losses.length) {
  console.error(
    `audit-ats-base: the base's parser loses ${losses.length} field readings from this print${accepted ? ', a trade the pull request declares accepted' : ''}.`
  );
}
process.exitCode = exitCode;

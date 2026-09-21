import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { AtsScore } from '../core/AtsScore.js';
import { AtsReport } from '../core/AtsReport.js';
import { AtsFloors } from '../core/AtsFloors.js';
import { AdvertMatcher } from '../core/AdvertMatcher.js';
import { GenerationTarget } from '../core/GenerationTarget.js';
import { manifestReader, resolveRun } from './lib/published-targets.mjs';
import { catalogueTranslator } from './lib/printed-letter.mjs';
import { auditedFiles } from './lib/printed-cv.mjs';

/**
 * The third audit: what a stranger's parser recovers.
 *
 * `audit-print` asks whether the strings this repository wrote survived, because its
 * expectations come from the authored JSON. It does not ask the question an applicant
 * tracking system actually puts to the document: **given this file and no access to the
 * source, what structure can be rebuilt?**
 *
 * Nothing here parses. The parser is pure, takes a string, and cannot read the answer key —
 * this file only fetches text and reports.
 */
const projectRoot = new URL('../', import.meta.url);
// One CV, or a run over every CV the manifest publishes, each re-run naming itself (#248).
const argv = process.argv.slice(2);
const run = await resolveRun('audit-ats', fileURLToPath(import.meta.url), argv, {
  readManifest: manifestReader(projectRoot)
});
if ('exit' in run) process.exit(run.exit);
const { target } = run;

/** Stop, having said what was not checked. An audit that did not run must not read as a pass. */
function cannotCheck(reason, hint) {
  console.error(`audit-ats: ${reason} — nothing was checked.`);
  if (hint) console.error(hint);
  // The report is deliberately left as it was: a stale matrix must never become the record
  // of a run that did not happen.
  process.exit(2);
}

let document;
let authored;
try {
  authored = JSON.parse(await readFile(new URL(target.dataPath, projectRoot)));
  document = new CvDocument(authored);
} catch (error) {
  cannotCheck(`cannot read ${target.dataPath}`, error.message);
}

// The words the page wrote a degree's scope in, so a degree is compared as the document prints it (#186). A catalogue
// that cannot be read stops the audit: without it a printed scope would read as a loss nobody made.
let words;
try {
  const t = catalogueTranslator({
    cv: JSON.parse(await readFile(new URL(`locales/${target.locale}/cv.json`, projectRoot)))
  });
  words = { locale: target.locale, credits: (count) => t('cv:education.credits', { count }) };
} catch (error) {
  cannotCheck(`cannot read the ${target.locale} catalogue`, error.message);
}

// An advert that cannot be read is not the same as no advert: the first is a mistake to
// report, the second a deliberate run without one. Silently treating them alike would let a
// typo in a path look like a decision. `--advert <path>` is read as `--advert=<path>` (#272).
const advertPath = GenerationTarget.options(argv).get('advert');
let advertText = null;
if (advertPath) {
  try {
    advertText = await readFile(advertPath, 'utf8');
  } catch (error) {
    cannotCheck(`cannot read the advert at ${advertPath}`, error.message);
  }
}

try {
  execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
} catch {
  cannotCheck('pdftotext is not installed', 'Install poppler-utils and run again.');
}

// The files a recruiter receives, and nothing else: the CV printed from the page in each layout (#149), and the
// letter beside each when the profile carries one. Chosen by the target, never by the directory: every published
// CV prints into generated/, so a run that read the directory graded the German PDFs against the English profile
// and the English against the German, and the English report fell from 80/80 to 63.2 for a CV nothing had
// changed (#248). A directory beside them, such as the qa/ an older build wrote, is not read either.
const onDisk = (path) => existsSync(new URL(path, projectRoot));
const files = auditedFiles(target, authored, run.manifest.layouts, onDisk).map(
  ({ path, isCover }) => ({
    artefact: path,
    path: new URL(path, projectRoot).pathname,
    isCover
  })
);

if (!files.filter((file) => !file.isCover).length) {
  cannotCheck(
    `no PDFs under ${target.outDir}`,
    'Run `npm run build:pdf` first, with the same --profile.'
  );
}

const results = [];
const letters = [];
const seen = new Map();
let advert = null;
for (const { artefact, path, isCover } of files) {
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
  if (isCover) {
    // The letter's own question, and the only one worth asking of it here: does the reader
    // it names survive extraction?
    // Read from the authored JSON, not from CvDocument: that model is the CV's and does not
    // carry a letter, so `document.letter` was always undefined and `[].every()` was always
    // true — a check that could not fail, found by breaking the thing it was meant to catch.
    const wanted = [authored.letter?.recipient?.company, authored.letter?.subject].filter(Boolean);
    letters.push({
      artefact,
      wanted,
      // Nothing to compare against is not a pass. A cover letter beside a profile that
      // carries none is a mismatch worth saying out loud.
      recovered: wanted.length ? wanted.every((term) => text.includes(term)) : null
    });
    continue;
  }
  // The same file in the order its content stream draws it, which PDFBox and Tika read by default. Poppler's
  // own order reassembles columns by position, and the two can fail differently: the two-column browser
  // print kept its contacts on top in poppler's order and lost its email in the content stream's (#147).
  const raw = execFileSync('pdftotext', ['-raw', path, '-'], { encoding: 'utf8' });
  const fingerprint = createHash('sha256').update(text).update('\0').update(raw).digest('hex');

  // Two files can carry the same text, so the set of distinct text streams can be smaller
  // than the set of files. Saying which is which is cheaper and more honest than parsing the
  // same string twice.
  if (seen.has(fingerprint)) {
    seen.get(fingerprint).push(artefact);
    continue;
  }
  seen.set(fingerprint, [artefact]);

  const recovered = AtsTextParser.parse(text);
  const diff = RecoveryDiff.diff(document, recovered, { words });
  if (advertText && !advert) {
    const extracted = AdvertMatcher.extractTerms(advertText);
    advert = {
      ...AdvertMatcher.match(extracted.terms, recovered, document),
      language: extracted.language
    };
    advert.opening = AdvertMatcher.opening(advert.terms, text);
  }

  // The same file read the way a better extractor reads it. Where the two disagree is where
  // a column was serialised — reported, not scored, until a fixture pins down what a bad
  // divergence looks like.
  const layout = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
  const divergence = AtsTextParser.parse(layout).experience.length !== recovered.experience.length;

  // Scored on poppler's order alone, so the number stays comparable with itself over time; gated on both.
  const floors = {
    default: AtsFloors.failures(diff),
    raw: AtsFloors.failures(RecoveryDiff.diff(document, AtsTextParser.parse(raw), { words }))
  };

  results.push({ artefact, diff, recovered, divergence, fingerprint, floors });
}

// The worst artefact, not the first. You send one of these, and the headline should be the
// one you risk rather than the one that happens to be alphabetically first.
const scores = results.map((entry) => AtsScore.compose(entry.diff, advert));
const score = scores.reduce((worst, candidate) =>
  candidate.points < worst.points ? candidate : worst
);

// The floors: not the score, which never gates anything, but the four failures that mean the
// parsed record is unusable however good the rest looks — in either reading order.
const floors = letters
  .filter((entry) => entry.recovered !== true)
  .map((entry) =>
    entry.recovered === null
      ? `${entry.artefact}: a cover letter was generated but the profile carries no letter to check it against`
      : `${entry.artefact}: the letter's recipient or subject did not survive extraction`
  )
  .concat(
    results.flatMap(({ artefact, floors: failed }) => [
      ...failed.default.map((failure) => `${artefact}: ${failure}`),
      ...failed.raw.map(
        (failure) => `${artefact}, in content-stream order (pdftotext -raw): ${failure}`
      )
    ])
  );

const report = [
  AtsReport.render(score, results, advert),
  '',
  '## Distinct text streams',
  '',
  `${files.length} artefacts, ${results.length} distinct streams.`,
  '',
  ...[...seen.entries()].map(
    ([fingerprint, group]) => `- \`${fingerprint.slice(0, 12)}\` — ${group.join(', ')}`
  ),
  '',
  ...(letters.length
    ? [
        '',
        '## Cover letters',
        '',
        ...letters.map(
          (entry) =>
            `- ${entry.artefact} — recipient and subject ${entry.recovered === null ? 'COULD NOT BE CHECKED' : entry.recovered ? 'survive' : 'DO NOT survive'} extraction`
        )
      ]
    : []),
  '',
  results.some((entry) => entry.divergence)
    ? 'A layout-aware read of at least one artefact recovers a different number of roles. That is where a column is being serialised; reported, not scored.'
    : 'A layout-aware read recovers the same structure everywhere, so no column is being serialised.'
].join('\n');

await writeFile(new URL(target.reportPath('ATS_AUDIT.md'), projectRoot), `${report}\n`);
console.log(report);

if (floors.length) {
  console.error('');
  console.error(JSON.stringify(floors, null, 2));
  process.exitCode = 1;
}

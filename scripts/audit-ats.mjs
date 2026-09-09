import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { AtsScore } from '../core/AtsScore.js';
import { AtsReport } from '../core/AtsReport.js';
import { AdvertMatcher } from '../core/AdvertMatcher.js';
import { GenerationTarget } from '../core/GenerationTarget.js';

/**
 * The third audit: what a stranger's parser recovers.
 *
 * `audit-pdfs` and `audit-print` both ask whether the strings this repository wrote survived,
 * because their expectations come from the authored JSON. Neither asks the question an
 * applicant tracking system actually puts to the document: **given this file and no access
 * to the source, what structure can be rebuilt?**
 *
 * Nothing here parses. The parser is pure, takes a string, and cannot read the answer key —
 * this file only fetches text and reports.
 */
const projectRoot = new URL('../', import.meta.url);
const target = GenerationTarget.fromArguments(process.argv.slice(2));

/** Stop, having said what was not checked. An audit that did not run must not read as a pass. */
function cannotCheck(reason, hint) {
  console.error(`audit-ats: ${reason} — nothing was checked.`);
  if (hint) console.error(hint);
  // The report is deliberately left as it was: a stale matrix must never become the record
  // of a run that did not happen.
  process.exit(2);
}

let document;
try {
  document = new CvDocument(JSON.parse(await readFile(new URL(target.dataPath, projectRoot))));
} catch (error) {
  cannotCheck(`cannot read ${target.dataPath}`, error.message);
}

// An advert that cannot be read is not the same as no advert: the first is a mistake to
// report, the second a deliberate run without one. Silently treating them alike would let a
// typo in a path look like a decision.
const advertPath = process.argv.slice(2).find((argument) => argument.startsWith('--advert='))?.slice(9);
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

const directories = [target.outDir, target.qaDir];
const files = [];
for (const directory of directories) {
  const url = new URL(`${directory}/`, projectRoot);
  const entries = await readdir(url).catch(() => []);
  files.push(...entries.filter((name) => name.endsWith('.pdf')).sort()
    .map((name) => ({ artefact: `${directory}/${name}`, path: new URL(name, url).pathname })));
}

if (!files.length) {
  cannotCheck(`no PDFs under ${target.outDir}`, 'Run `npm run build:pdf` first, with the same --profile.');
}

const results = [];
const seen = new Map();
let advert = null;
for (const { artefact, path } of files) {
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
  const fingerprint = createHash('sha256').update(text).digest('hex');

  // The colour and monochrome variants are textually identical and A4 and LETTER are not,
  // so the set of distinct text streams is smaller than the set of files. Saying which is
  // which is cheaper and more honest than parsing the same string four times.
  if (seen.has(fingerprint)) {
    seen.get(fingerprint).push(artefact);
    continue;
  }
  seen.set(fingerprint, [artefact]);

  const recovered = AtsTextParser.parse(text);
  const diff = RecoveryDiff.diff(document, recovered);
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

  results.push({ artefact, diff, recovered, divergence, fingerprint });
}

// The worst artefact, not the first. You send one of these, and the headline should be the
// one you risk rather than the one that happens to be alphabetically first.
const scores = results.map((entry) => AtsScore.compose(entry.diff, advert));
const score = scores.reduce((worst, candidate) => (candidate.points < worst.points ? candidate : worst));

// The floors: not the score, which never gates anything, but the four failures that mean the
// parsed record is unusable however good the rest looks.
const floors = results.flatMap(({ artefact, diff }) => [
  diff.segmentation !== 'ok' && `${artefact}: the document did not segment`,
  diff.identity.email === 'lost' && `${artefact}: the email address was not recovered`,
  diff.experience.some((role) => !role.tripleAdjacent) && `${artefact}: a role lost its title, employer or period`,
  !diff.roleOrderMonotonic && `${artefact}: the chronology does not run one way`
].filter(Boolean));

const report = [
  AtsReport.render(score, results, advert),
  '',
  '## Distinct text streams',
  '',
  `${files.length} artefacts, ${results.length} distinct streams.`,
  '',
  ...[...seen.entries()].map(([fingerprint, group]) =>
    `- \`${fingerprint.slice(0, 12)}\` — ${group.join(', ')}`),
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

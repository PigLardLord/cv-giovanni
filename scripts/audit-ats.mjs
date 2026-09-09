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
let authored;
try {
  authored = JSON.parse(await readFile(new URL(target.dataPath, projectRoot)));
  document = new CvDocument(authored);
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
    .map((name) => ({
      artefact: `${directory}/${name}`,
      path: new URL(name, url).pathname,
      // A cover letter is not a CV and must not be parsed as one: it has no headings, no
      // chronology and no skills, so this audit would report a failed segmentation and trip
      // two floors on a perfectly good letter. A false failure is worse than no check — it
      // teaches whoever sees it to ignore the exit code.
      isCover: /-cover(-|\.)/.test(name)
    })));
}

if (!files.filter((file) => !file.isCover).length) {
  cannotCheck(`no PDFs under ${target.outDir}`, 'Run `npm run build:pdf` first, with the same --profile.');
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
const floors = letters.filter((entry) => entry.recovered !== true)
  .map((entry) => (entry.recovered === null
    ? `${entry.artefact}: a cover letter was generated but the profile carries no letter to check it against`
    : `${entry.artefact}: the letter's recipient or subject did not survive extraction`))
  .concat(results.flatMap(({ artefact, diff }) => [
  diff.segmentation !== 'ok' && `${artefact}: the document did not segment`,
  diff.identity.email === 'lost' && `${artefact}: the email address was not recovered`,
  diff.experience.some((role) => !role.tripleAdjacent) && `${artefact}: a role lost its title, employer or period`,
  !diff.roleOrderMonotonic && `${artefact}: the chronology does not run one way`
].filter(Boolean)));

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
  ...(letters.length ? ['', '## Cover letters', '',
    ...letters.map((entry) => `- ${entry.artefact} — recipient and subject ${entry.recovered === null ? 'COULD NOT BE CHECKED' : (entry.recovered ? 'survive' : 'DO NOT survive')} extraction`)]
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

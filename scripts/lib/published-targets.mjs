import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { GenerationTarget } from '../../core/GenerationTarget.js';
import { builtCv } from './printed-cv.mjs';

/**
 * Every CV the manifest publishes, built and audited in turn when a run names none (#248).
 *
 * The build and the audits read one CV each: the one `--profile` names, or the public one. CI names none, so a
 * second locale listed in the manifest was printed by nobody, audited by nobody, and offered by no page. A run
 * with no `--profile` is now a run over every published CV — each script re-run once per CV, naming it — so the
 * scripts keep reading one CV each and nothing inside them had to learn to loop.
 */

/** Whether a run names the one CV it is about. */
export const namesProfile = (argv) =>
  argv.some((argument) => argument === '--profile' || argument.startsWith('--profile='));

/**
 * The CVs the manifest publishes.
 * @param {URL} projectRoot - The repository root
 * @returns {Promise<GenerationTarget[]>} One per published profile and locale
 */
export async function publishedTargets(projectRoot) {
  const manifest = JSON.parse(
    await readFile(new URL('config/cv-manifest.json', projectRoot), 'utf8')
  );
  return GenerationTarget.published(manifest);
}

/**
 * Run a script once per published CV, in turn, and end on the worst exit any run had.
 *
 * One CV failing fails the run, and a run that checked nothing must never read as a pass, so 2 — "nothing was
 * checked" — outranks 1, a run killed before it finished counts as 2, and so does a manifest that publishes
 * nothing at all.
 * @param {string} script - The script to run, as a path
 * @param {GenerationTarget[]} targets - The published CVs
 * @param {string[]} argv - The run's own arguments, passed on to each
 * @param {Function} [run] - How a script is run, for the tests
 * @returns {number} The exit code the whole run ends on
 */
export function eachPublished(script, targets, argv, run = spawnSync) {
  if (!targets.length) {
    console.error(`${script}: config/cv-manifest.json publishes no CV, so nothing was checked.`);
    return 2;
  }
  return targets.reduce((worst, target) => {
    const { status } = run(
      process.execPath,
      [script, `--profile=${target.dataPath}`, `--out=${target.outDir}`, ...argv],
      { stdio: 'inherit' }
    );
    return Math.max(worst, status ?? 2);
  }, 0);
}

/**
 * Every file every published CV was printed to, in one list: what `generated/manifest.json` lets the page offer.
 * Each CV's run writes the list for its own files, over the last one's; this is the list for all of them.
 * @param {GenerationTarget[]} targets - The published CVs
 * @param {(target: GenerationTarget) => object} dataFor - The profile each is printed from
 * @param {string[]} layouts - The layouts the manifest declares
 * @returns {string[]} Every filename, in the manifest's order and then the layouts'
 */
export function releasedAcross(targets, dataFor, layouts) {
  return targets.flatMap((target) =>
    builtCv(target, dataFor(target), layouts, () => true).files.map(({ filename }) => filename)
  );
}

/**
 * Why a run cannot print the profile it names, or null when it can (#248).
 *
 * The page loads only a profile the manifest lists — a tailored one under applications/ is merged in by the
 * development server — so a profile under profiles/ that the manifest leaves out throws before anything renders,
 * and the print waited 30 seconds for a page that was never going to be ready.
 * @param {string[]} argv - The run's arguments
 * @param {GenerationTarget[]} targets - The published CVs
 * @returns {string|null} A sentence naming the file and the manifest, or null
 */
export function unlistedProfile(argv, targets) {
  if (!namesProfile(argv)) return null;
  const { dataPath } = GenerationTarget.fromArguments(argv);
  if (!dataPath.startsWith('profiles/')) return null;
  if (targets.some((target) => target.dataPath === dataPath)) return null;
  return (
    `${dataPath} is not listed in config/cv-manifest.json, and the page loads no profile under profiles/ that ` +
    'the manifest leaves out, so there is nothing to print. List it there to publish it, or copy it under ' +
    'applications/ to build it for yourself.'
  );
}

import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { GenerationTarget } from '../../core/GenerationTarget.js';
import { printedLayout } from '../../core/ProfileResolver.js';
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
    console.error(
      `${basename(script, '.mjs')}: config/cv-manifest.json publishes no CV, so nothing was checked.`
    );
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

/**
 * What a run is about: one CV to read, or an exit code to end on (#248).
 *
 * Every script opened with the same few lines, and the copies had already drifted — two refused a profile the
 * manifest does not list and two did not. So the decision is made once, and the manifest is read once:
 *
 * - Every run needs the manifest for its layouts, so one that does not parse ends every run, with a sentence
 *   naming the file and exit 2 rather than the stack trace a second read of it used to end on.
 * - `--profile` under `profiles/` names a published CV, and one the manifest does not list is refused, since the
 *   page loads no such profile. A tailored profile is not published, so a mistake in the published list cannot
 *   stop it.
 * - No `--profile` is a run over every published CV, each re-run naming itself; a manifest that publishes none is
 *   refused before anything around the run starts. `--out` without `--profile` is refused: it names where one CV
 *   is printed, and the download list would still be written over generated/.
 * @param {string} name - The script's name, for what it says
 * @param {string} script - The script's own path, to re-run it
 * @param {string[]} argv - The run's arguments
 * @param {object} options - How to read the manifest, and optionally how to run a script, how to speak, and a
 *   wrapper `around(runAll, published, manifest)` for work before and after the whole run
 * @returns {Promise<{ target: GenerationTarget, manifest: object } | { exit: number }>} The CV to read and the
 *   manifest it was read against — its layouts narrowed to the one `--layout` names, when it names one — or how the
 *   run ends
 */
export async function resolveRun(name, script, argv, options) {
  const { readManifest, run = spawnSync, around, say = console.error } = options;
  const refuse = (sentence) => {
    say(`${name}: ${sentence}`);
    return { exit: 2 };
  };

  // An option with no value is refused once, here, rather than once by each CV a run over all of them starts.
  try {
    GenerationTarget.options(argv);
  } catch (error) {
    return refuse(error.message);
  }

  let manifest;
  try {
    manifest = await readManifest();
  } catch (error) {
    return refuse(`config/cv-manifest.json cannot be read — ${error.message}`);
  }
  const published = () => {
    try {
      return { targets: GenerationTarget.published(manifest) };
    } catch (error) {
      return { error: error.message };
    }
  };

  // One layout of a tailored CV, which a tailoring job prints and audits in the layout it was asked for (#303). Never of a
  // published one: its build writes the list of downloads the page offers, and its audits the reports in docs/, and
  // either narrowed to one layout would drop the others.
  const layout = GenerationTarget.options(argv).get('layout');
  if (layout !== undefined) {
    // One layout is printed (#361): a tailored CV too is printed in it, and in no other.
    let printed;
    try {
      printed = printedLayout(manifest);
    } catch (error) {
      return refuse(error.message);
    }
    if (layout !== printed) {
      return refuse(`--layout ${layout} is not the layout the CV is printed in: ${printed}.`);
    }
    // A --profile that names no CV is refused below, with its own reason.
    let tailored = false;
    if (namesProfile(argv)) {
      try {
        tailored = !GenerationTarget.fromArguments(argv).dataPath.startsWith('profiles/');
      } catch {
        tailored = true;
      }
    }
    if (!tailored) {
      return refuse(
        '--layout prints and audits one layout of a tailored CV, named with --profile outside profiles/. A ' +
          'published CV is printed and audited in every layout the page offers.'
      );
    }
    manifest = { ...manifest, layouts: [layout] };
  }

  if (namesProfile(argv)) {
    let target;
    try {
      target = GenerationTarget.fromArguments(argv);
    } catch (error) {
      return refuse(error.message);
    }
    if (!target.dataPath.startsWith('profiles/')) return { target, manifest };
    const { targets, error } = published();
    if (error) return refuse(error);
    const unlisted = unlistedProfile(argv, targets);
    return unlisted ? refuse(unlisted) : { target, manifest };
  }

  if (argv.some((argument) => argument === '--out' || argument.startsWith('--out='))) {
    return refuse(
      '--out says where one CV is printed; name that CV with --profile. A run over every published CV prints ' +
        'into generated/, which is what the page reads.'
    );
  }
  const { targets, error } = published();
  if (error) return refuse(error);
  if (!targets.length)
    return refuse('config/cv-manifest.json publishes no CV, so nothing was checked.');
  const runAll = () => eachPublished(script, targets, argv, run);
  return { exit: around ? await around(runAll, targets, manifest) : runAll() };
}

/**
 * Print every published CV, and leave the page's download list true to what printed (#248).
 *
 * Each CV's build writes the list for its own files over the last one's. So the list is written here once, after
 * every CV has printed: all their files. If one failed it is put back exactly as it was before the run — or left
 * absent, if there was none — so the page never offers whichever CV happened to print last.
 * @param {() => number | Promise<number>} printAll - Print every published CV, and say how the run ended
 * @param {{ read: Function, write: Function, remove: Function, union: Function }} list - The list on disk, and
 *   every file every CV printed
 * @returns {Promise<number>} How the run ended
 */
export async function printedDownloadList(printAll, { read, write, remove, union }) {
  const before = await read();
  const exit = await printAll();
  if (exit !== 0) {
    if (before === null) await remove();
    else await write(before);
    return exit;
  }
  await write(`${JSON.stringify({ released: await union() }, null, 2)}\n`);
  return exit;
}

/** Read `config/cv-manifest.json` under a project root. */
export const manifestReader = (projectRoot) => async () =>
  JSON.parse(await readFile(new URL('config/cv-manifest.json', projectRoot), 'utf8'));

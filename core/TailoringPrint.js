import { CvFiles } from './CvFiles.js';

/** How the scripts end: 0 checked and passed, 1 checked and failed, 2 not checked at all. */
const NOT_RUN = 2;

/**
 * Whether a script checked nothing: it said so, or it was stopped — by a signal or its time limit — before it could say
 * anything (the review of #320).
 */
const checkedNothing = ({ exitCode }) => exitCode === NOT_RUN || exitCode === null;

/** The pages each document may take (#260): the CV two A4 pages, the letter one. */
const PAGES = Object.freeze({ cv: 2, letter: 1 });

/**
 * The print of a tailored CV and its letter, and the gate it has to pass (#260, #303).
 *
 * The tailored profile is written where a local profile lives, `applications/<id>/<language>.json`, and printed and
 * audited by the scripts the command line runs, in the job's one layout: `build:pdf`, `audit:print` and `audit:ats`.
 * What they find is sorted by who can fix it. A document that runs past its pages is the copy's to fix — the model
 * cuts it — and goes back; anything else the audits refuse is a layout defect the copy cannot fix (#17), and does
 * not. An audit that could not run is neither: it is reported as not run, never as a pass.
 */
export class TailoringPrint {
  /**
   * @param {object} ports - What the print reaches the machine through
   * @param {{ writeText: Function, readText: Function, exists: Function }} ports.files - The project's files
   * @param {{ run: (name: string, args: string[]) => Promise<object> }} ports.scripts - The project's scripts
   */
  constructor({ files, scripts }) {
    this.files = files;
    this.scripts = scripts;
    this.naming = new CvFiles();
  }

  /** Where a job's tailored profile is printed from: a local profile, named for the job and its language. */
  static profilePath(directory, language) {
    return `${directory}/${language}.json`;
  }

  /**
   * @param {{ id: string, directory: string, options: { language: string, layout: string } }} job - The job
   * @param {object} profile - The tailored profile, its letter included
   * @returns {Promise<{ passed: boolean, printed: boolean, failures: object[], notRun: string[], files: object }>}
   *   Whether the print passed, whether anything was printed at all, every failure — each saying whether the copy can
   *   fix it — the audits that could not run, and the documents it printed
   */
  async run(job, profile) {
    const { directory, options } = job;
    const path = TailoringPrint.profilePath(directory, options.language);
    await this.files.writeText(path, `${JSON.stringify(profile, null, 2)}\n`);
    const args = [`--profile=${path}`, '--layout', options.layout];
    const out = `${directory}/out`;
    const combination = {
      profile: directory.split('/').pop(),
      locale: options.language,
      layout: options.layout
    };
    const files = {
      cv: `${out}/${this.naming.filename(profile, combination)}`,
      letter: profile.letter ? `${out}/${this.naming.letterFilename(profile, combination)}` : null
    };

    const built = await this.scripts.run('generate-pdfs', args);
    if (built.exitCode !== 0) {
      // Nothing to deliver, whatever the gate says: the names above are what it would have printed (the review of
      // #320).
      return {
        passed: false,
        printed: false,
        failures: [],
        notRun: [
          `build:pdf (${checkedNothing(built) ? 'nothing printed' : 'failed'}${lastWords(built.stderr)})`
        ],
        files: { cv: null, letter: null }
      };
    }

    const failures = [];
    const notRun = [];
    // The results of an earlier attempt are overwritten first, so an audit that stops before writing its own is read as
    // no results, never as the last attempt's (the review of #320).
    const resultsPath = `${out}/PRINT_AUDIT.json`;
    await this.files.writeText(resultsPath, 'null\n');
    const print = await this.scripts.run('audit-print', args);
    if (checkedNothing(print)) notRun.push('audit:print');
    else {
      const results = await this.results(resultsPath);
      const ofLayout = results?.cv?.some?.(({ layout }) => layout === options.layout);
      if (!results || !ofLayout) notRun.push('audit:print (no results)');
      else failures.push(...TailoringPrint.printFailures(results));
      if (print.exitCode !== 0 && results && ofLayout && !failures.length) {
        failures.push({
          document: 'cv',
          check: 'audit:print',
          copy: false,
          reason: 'audit:print failed'
        });
      }
    }
    const ats = await this.scripts.run('audit-ats', args);
    if (checkedNothing(ats)) notRun.push('audit:ats');
    else if (ats.exitCode !== 0) {
      failures.push({
        document: 'cv',
        check: 'audit:ats',
        copy: false,
        reason:
          'the CV or its letter fails one of audit:ats’s floors: the report beside it says which'
      });
    }
    return { passed: !failures.length && !notRun.length, printed: true, failures, notRun, files };
  }

  /** The results `audit:print` writes beside its report for a tailored CV, or null when there are none to read. */
  async results(path) {
    if (!(await this.files.exists(path))) return null;
    try {
      return JSON.parse(await this.files.readText(path));
    } catch {
      return null;
    }
  }

  /**
   * What the print audit refused, sorted by who can fix it: a document past its pages is the copy's, every other check
   * the layout's.
   * @param {{ cv: object[], letters: object[] }} results - What `audit:print` wrote beside its report
   * @returns {{ document: string, check: string, copy: boolean, reason: string }[]} The failures
   */
  static printFailures({ cv = [], letters = [] }) {
    return [
      ...cv.map((row) => ({ ...row, document: 'cv' })),
      ...letters.map((row) => ({ ...row, document: 'letter' }))
    ].flatMap(({ document, pages, failed = [] }) =>
      failed.map((check) =>
        check === 'pages'
          ? {
              document,
              check,
              copy: true,
              reason: `the ${document === 'cv' ? 'CV' : 'letter'} printed ${pages} pages, and must fit ${PAGES[document]}: cut it until it does`
            }
          : {
              document,
              check,
              copy: false,
              reason: `the ${document === 'cv' ? 'CV' : 'letter'} fails ${check} in audit:print`
            }
      )
    );
  }
}

/** What a script said last before it stopped, for the job's state: the terminal has the rest. */
function lastWords(stderr = '') {
  const line = String(stderr)
    .split('\n')
    .map((text) => text.trim())
    .filter((text) => /^(Error|[\w-]+:)/.test(text))
    .at(-1);
  return line ? `: ${line}` : '';
}

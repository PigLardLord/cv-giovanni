import { APPLICATION_NAME } from './Applications.js';
import { EFFORTS, MODELS } from './Inference.js';
import { ProfileShape } from './ProfileShape.js';
import { ProfileStore } from './ProfileStore.js';
import { Refusal } from './Refusal.js';
import { CvFiles } from './CvFiles.js';

/** What a tailoring takes besides its advert, and what each is when the request leaves it out (#260). */
export const DEFAULTS = Object.freeze({
  language: 'en',
  model: 'claude-opus-5',
  effort: 'max',
  // Until #231 names the layout that stays.
  layout: 'technical',
  auditRetries: 2,
  auditGate: true
});
const FIELDS = Object.freeze(['advert', 'cv', 'letter', ...Object.keys(DEFAULTS)]);
const MOST_RETRIES = 5;

/**
 * How long a job takes, in seconds, by effort, until ten measured jobs replace the guess. A guess, and the answer
 * says so: nothing had run when it was written.
 */
export const SEED_SECONDS = Object.freeze({
  low: 90,
  medium: 150,
  high: 240,
  xhigh: 360,
  max: 480
});
const MEASURED = 10;

/** A language has catalogues when `locales/<language>/` exists: `en` and `de` today. */
const LANGUAGE = /^[a-z]{2}$/;

/**
 * What a letter's defaults hold, and what each must be (#279): the salary expectation as the letter should state it,
 * the earliest start as a date `Intl` can word in the letter's language, and what the owner wants every letter to say.
 */
const LETTER_FIELDS = Object.freeze({
  salaryExpectation: 'text',
  startDate: 'a date, YYYY-MM or YYYY-MM-DD',
  note: 'text'
});
const DATE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

/** A machine with no full CV and no letter defaults: every job starts from the published CV. */
const NO_FULL_CV = Object.freeze({
  readCv: async () => ({ cv: null, where: null }),
  readLetter: async () => ({ letter: null, where: null })
});

/** A service given no work: the server hands it a `Tailor` (#284), and a test hands it what it checks. */
const NOTHING_TO_RUN = async () => {
  throw new Refusal(501, 'This service was built without its work: nothing runs a tailoring.');
};

/**
 * Tailorings: an advert in, a CV and a letter written for it out, as a job that takes minutes (#260, #275).
 *
 * Tailoring with Opus 5 at max effort takes longer than a request should stay open. So `create` answers at once
 * with an id and an estimate, the jobs run one at a time in order of arrival — one machine should not run three
 * models and three headless Chromes at once, and a subscription's limits are per account — and `status` answers
 * the job's state while the client polls.
 *
 * A job lives in `applications/<id>/`, which git ignores: the advert, the request's options, and its state, which
 * is what lets it survive the server stopping. What the job does is the `work` port: a `Tailor` (#284).
 */
export class Tailorings {
  /**
   * @param {object} ports - What the service reaches the machine through
   * @param {{ readText: Function, writeText: Function, exists: Function, list: Function }} ports.files - The
   *   project's files
   * @param {{ status: Function }} ports.inference - Which backend a run would use, and how it charges
   * @param {{ readCv: Function, readLetter: Function }} [ports.fullCv] - The full CV and the letter's defaults its
   *   owner keeps outside the project (#279)
   * @param {(job: object, progress: { update: Function }) => Promise<object>} [ports.work] - What a job does
   * @param {() => number} [ports.clock] - The time, in milliseconds since the epoch
   * @param {() => string} [ports.random] - Six random hex digits, to make an id no one can guess or collide with
   */
  constructor({
    files,
    inference,
    fullCv = NO_FULL_CV,
    work = NOTHING_TO_RUN,
    clock = Date.now,
    random = hex
  }) {
    this.files = files;
    this.inference = inference;
    this.fullCv = fullCv;
    this.work = work;
    this.clock = clock;
    this.random = random;
    this.jobs = new Map();
    this.queue = [];
    this.history = [];
    this.current = null;
    this.running = null;
    // Every write of a job's state goes through this, in order: two saves in flight on one file land in any order,
    // and a progress update landing after the final state would leave a finished job running on disk.
    this.writes = Promise.resolve();
  }

  /** Where a job's files are, relative to the project. */
  static paths(id) {
    const directory = `applications/${id}`;
    return {
      directory,
      advert: `${directory}/advert.txt`,
      request: `${directory}/request.json`,
      source: `${directory}/source.json`,
      state: `${directory}/state.json`
    };
  }

  /**
   * Reads the jobs an earlier run of the server left, once: a job that was running is marked failed, and the jobs
   * that were waiting are queued again, in their order of arrival.
   * @returns {Promise<void>}
   */
  start() {
    // A recovery that failed is tried again on the next call, rather than answering every call after it with its error.
    this.started ??= this.recover().catch((error) => {
      this.started = null;
      throw error;
    });
    return this.started;
  }

  /**
   * @param {object} request - The advert's text, and the options #260 names
   * @returns {Promise<object>} The job's id, its status, the estimate and its basis, the backend and its cost, and
   *   the CV the job starts from
   * @throws {Refusal} 422 for a request it cannot take, 503 when this machine's full CV or letter defaults cannot be
   *   used, or no backend could run it. A job whose files were only partly written stays as it is: nothing under
   *   `applications/` is deleted automatically.
   */
  async create(request) {
    await this.start();
    const { advert, cv: given, letter: overrides, options } = await this.accepted(request);
    const { cv, source } = await this.startingCv(given);
    const letter = await this.letterFor(overrides);
    const { backend, cost, unavailable } = await this.inference.status();
    if (!backend) {
      const reasons = unavailable.map((entry) => `${entry.backend}: ${entry.reason}`).join('; ');
      throw new Refusal(503, `No inference is available on this machine — ${reasons}.`);
    }

    const now = this.clock();
    const id = await this.newId(now);
    const paths = Tailorings.paths(id);
    const state = {
      id,
      status: 'queued',
      createdAt: new Date(now).toISOString(),
      model: options.model,
      effort: options.effort,
      backend,
      cost,
      source,
      estimate: this.estimate(options, backend),
      attempts: 0
    };
    await this.files.writeText(paths.advert, advert);
    await this.files.writeText(
      paths.request,
      `${JSON.stringify({ ...options, letter }, null, 2)}\n`
    );
    await this.files.writeText(paths.source, `${JSON.stringify(cv, null, 2)}\n`);
    await this.save(state);
    this.queue.push(id);
    this.drain();
    // The job may be running already, when nothing was ahead of it: the answer says what it is now.
    return {
      id,
      status: this.jobs.get(id).status,
      estimateSeconds: this.secondsLeft(id),
      estimateBasis: state.estimate.basis,
      backend,
      cost,
      source: state.source
    };
  }

  /**
   * @param {string} id - A job's id
   * @returns {Promise<object>} The job's state, with the seconds left
   * @throws {Refusal} 404 when no job has that id
   */
  async status(id) {
    await this.start();
    const state = typeof id === 'string' && APPLICATION_NAME.test(id) ? this.jobs.get(id) : null;
    if (!state) throw new Refusal(404, `No tailoring job ${JSON.stringify(String(id))}.`);
    // A ready job says where its documents download from (#303); the files on this machine stay its own business.
    const printed = state.status === 'ready' ? (state.result?.files ?? {}) : {};
    const downloads = Object.fromEntries(
      ['cv', 'letter']
        .filter((document) => printed[document])
        .map((document) => [document, `/api/tailorings/${id}/${document}`])
    );
    return {
      ...state,
      secondsLeft: this.secondsLeft(id),
      ...(Object.keys(downloads).length && { downloads })
    };
  }

  /**
   * A ready job's CV, as a recruiter receives it (#303).
   * @param {string} id - A job's id
   * @returns {Promise<{ file: Buffer, type: string, filename: string }>} The PDF, and the name it is saved as
   * @throws {Refusal} 404 when no job has that id, or it failed; 409 while it is not ready
   */
  cv(id) {
    return this.download(id, 'cv');
  }

  /** A ready job's letter, as `cv` gives its CV. */
  letter(id) {
    return this.download(id, 'letter');
  }

  /**
   * A document a ready job printed. Named for the recruiter who saves it as the public CV is — the candidate, the role
   * and the document, `Ada-Lovelace-Senior-iOS-Engineer-CV.pdf`, its letter in the job's language,
   * `…-Anschreiben.pdf` — never for the job, whose id says nothing to them.
   */
  async download(id, document) {
    const state = await this.status(id);
    if (state.status === 'failed') {
      throw new Refusal(404, `The job ${id} failed: it delivered no ${document}.`);
    }
    if (state.status !== 'ready') {
      throw new Refusal(
        409,
        `The job ${id} is ${state.status}: its ${document} is not printed yet.`
      );
    }
    const path = state.result?.files?.[document];
    // A file gone from disk since — applications/ cleaned by hand — is a refusal, not the server failing.
    if (!path || !(await this.files.exists(path)))
      throw new Refusal(404, `The job ${id} printed no ${document}.`);
    const { language } = JSON.parse(await this.files.readText(Tailorings.paths(id).request));
    const profile = JSON.parse(await this.files.readText(`applications/${id}/${language}.json`));
    // The CV is a CV in every language, as the public one's name says; a letter is named in the job's catalogue:
    // "Cover Letter", "Anschreiben".
    let word = 'CV';
    if (document === 'letter') {
      const catalogue = JSON.parse(await this.files.readText(`locales/${language}/ui.json`));
      word = 'files.letter'.split('.').reduce((node, step) => node?.[step], catalogue) || 'letter';
    }
    return {
      file: await this.files.readBytes(path),
      type: 'application/pdf',
      filename: new CvFiles().downloadName(profile, word)
    };
  }

  /** Resolves once the queue is empty and nothing runs. */
  async idle() {
    while (this.running) await this.running;
  }

  /** The request's advert and options, with every default, or a refusal listing every problem. */
  async accepted(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new Refusal(422, "A tailoring is a JSON object with the advert's text.");
    }
    const unknown = Object.keys(request).filter((field) => !FIELDS.includes(field));
    if (unknown.length) {
      throw new Refusal(
        422,
        `A tailoring does not take ${unknown.join(', ')}: it takes ${FIELDS.join(', ')}.`
      );
    }
    const { advert, cv, letter, ...given } = request;
    if (typeof advert !== 'string' || !advert.trim()) {
      throw new Refusal(422, "A tailoring needs the advert's text.");
    }

    const options = { ...DEFAULTS, ...given };
    const languages = (await this.files.list('locales'))
      .filter((name) => LANGUAGE.test(name))
      .sort();
    const { layouts = [] } = JSON.parse(await this.files.readText('config/cv-manifest.json'));
    const oneOf = (accepted) => (value) =>
      accepted.includes(value) ? null : `is one of ${accepted.join(', ')}; not ${value}`;
    const rules = {
      language: oneOf(languages),
      model: oneOf(MODELS),
      effort: oneOf(EFFORTS),
      layout: oneOf(layouts),
      auditRetries: (value) =>
        Number.isInteger(value) && value >= 0 && value <= MOST_RETRIES
          ? null
          : `is a whole number from 0 to ${MOST_RETRIES}; not ${JSON.stringify(value)}`,
      auditGate: (value) =>
        typeof value === 'boolean' ? null : `is true or false; not ${JSON.stringify(value)}`
    };
    const problems = [
      ...Object.entries(rules)
        .map(([path, rule]) => ({ path, reason: rule(options[path]) }))
        .filter(({ reason }) => reason),
      ...(cv === undefined ? [] : within('cv', ProfileShape.problems(cv))),
      ...(letter === undefined ? [] : within('letter', letterProblems(letter)))
    ];
    if (problems.length) {
      throw new Refusal(422, `The tailoring cannot run as asked: ${summary(problems)}.`, problems);
    }
    return { advert, cv, letter, options };
  }

  /**
   * The CV a job starts from: the request's, else the full CV its owner keeps, else the published one (#279).
   * @throws {Refusal} 503 when the full CV cannot be read, or does not have the profile's shape
   */
  async startingCv(given) {
    if (given !== undefined) return { cv: given, source: 'request' };
    const { cv, where } = await this.fullCv.readCv();
    if (cv) {
      const problems = ProfileShape.problems(cv);
      if (problems.length) {
        throw new Refusal(
          503,
          `The full CV at ${where} cannot be tailored: ${summary(problems)}.`,
          problems
        );
      }
      return { cv, source: where };
    }
    return {
      cv: JSON.parse(await this.files.readText(ProfileStore.path)),
      source: ProfileStore.path
    };
  }

  /**
   * The letter's defaults, with the request's fields over them, field by field (#279).
   * @throws {Refusal} 503 when the defaults cannot be read, or hold something a letter does not take
   */
  async letterFor(overrides = {}) {
    const { letter: defaults, where } = await this.fullCv.readLetter();
    if (defaults !== null) {
      const problems = letterProblems(defaults);
      if (problems.length) {
        throw new Refusal(
          503,
          `The letter's defaults at ${where} cannot be used: ${summary(problems)}.`,
          problems
        );
      }
    }
    return { ...(defaults ?? {}), ...overrides };
  }

  /** An id no job or application has: when the job arrived, to the second, and six random hex digits. */
  async newId(now) {
    const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    for (let tries = 0; tries < 5; tries += 1) {
      const id = `${stamp}-${this.random()}`;
      const taken = this.jobs.has(id) || (await this.files.exists(Tailorings.paths(id).directory));
      if (APPLICATION_NAME.test(id) && !taken) return id;
    }
    throw new Error('no free id for a tailoring job after five tries');
  }

  /**
   * How long a job with these options should take, in seconds: the median of the last ten ready jobs with the same
   * model, effort and backend, attempts included, or the seed until ten exist. Ready ones only: a job that failed at
   * once — a refused model, a backend that cannot be reached — would drag the median towards nothing.
   */
  estimate({ model, effort }, backend) {
    const alike = this.history
      .filter((job) => job.model === model && job.effort === effort && job.backend === backend)
      .slice(-MEASURED)
      .map((job) => job.seconds);
    if (alike.length < MEASURED) return { seconds: SEED_SECONDS[effort], basis: 'seed' };
    return { seconds: median(alike), basis: 'measured' };
  }

  /** What is left of a job's estimate and of every job ahead of it, in seconds. */
  secondsLeft(id) {
    const state = this.jobs.get(id);
    const left = (job) => {
      if (job.status === 'queued') return job.estimate.seconds;
      if (job.status !== 'running') return 0;
      const elapsed = Math.round((this.clock() - Date.parse(job.startedAt)) / 1000);
      return Math.max(0, job.estimate.seconds - elapsed);
    };
    if (state.status !== 'queued') return left(state);
    const place = this.queue.indexOf(id);
    const ahead = [this.current, ...(place < 0 ? [] : this.queue.slice(0, place))].filter(Boolean);
    return ahead.reduce((sum, other) => sum + left(this.jobs.get(other)), left(state));
  }

  /** Runs the queue, one job at a time, unless it is running already. */
  drain() {
    if (this.running) return;
    this.running = (async () => {
      while (this.queue.length) {
        const id = this.queue.shift();
        this.current = id;
        try {
          await this.run(id);
        } catch (error) {
          // The job's state could not be written to disk. It ended in memory, and the terminal says why.
          console.error(error);
        } finally {
          this.current = null;
        }
      }
    })().finally(() => {
      this.running = null;
      // A job queued between the last look at the queue and here would otherwise wait for the next one.
      if (this.queue.length) this.drain();
    });
  }

  /**
   * Runs one job and records how it ended. Whatever fails after the job is marked running — its files, the work, a
   * write of its state — the job ends failed or ready in memory, never left running with no one to finish it.
   */
  async run(id) {
    const started = this.clock();
    const paths = Tailorings.paths(id);
    const update = (fields) => this.save({ ...this.jobs.get(id), ...fields });

    let ending;
    try {
      await this.save({
        ...this.jobs.get(id),
        status: 'running',
        startedAt: new Date(started).toISOString()
      });
      const job = {
        id,
        directory: paths.directory,
        advert: await this.files.readText(paths.advert),
        options: JSON.parse(await this.files.readText(paths.request)),
        cv: JSON.parse(await this.files.readText(paths.source)),
        backend: this.jobs.get(id).backend
      };
      ending = { status: 'ready', result: (await this.work(job, { update })) ?? {} };
    } catch (error) {
      if (!(error instanceof Refusal)) console.error(error);
      ending = {
        status: 'failed',
        reason:
          error instanceof Refusal
            ? error.message
            : 'The job failed: the terminal running the server says why.',
        // What failed, item by item, and what the attempts cost, when the work says (#284).
        ...(error instanceof Refusal && error.details && { problems: error.details }),
        ...(error instanceof Refusal && error.cost && { cost: error.cost }),
        // What a job that ran to its gate found, though it delivers nothing (#303).
        ...(error instanceof Refusal && error.result && { result: error.result })
      };
    }
    const finished = this.clock();
    const state = {
      ...this.jobs.get(id),
      ...ending,
      finishedAt: new Date(finished).toISOString(),
      seconds: Math.round((finished - started) / 1000)
    };
    if (state.status === 'ready') this.history.push(state);
    await this.save(state);
  }

  /** Keeps a job's state as the one this server answers with, and writes it after every write before it. */
  save(state) {
    this.jobs.set(state.id, state);
    const text = `${JSON.stringify(state, null, 2)}\n`;
    const write = () => this.files.writeText(Tailorings.paths(state.id).state, text);
    this.writes = this.writes.then(write, write);
    return this.writes;
  }

  /** Reads what an earlier run left in `applications/`. */
  async recover() {
    const found = [];
    for (const name of await this.files.list('applications')) {
      if (!APPLICATION_NAME.test(name)) continue;
      const path = Tailorings.paths(name).state;
      try {
        if (!(await this.files.exists(path))) continue;
        const job = { ...JSON.parse(await this.files.readText(path)), id: name };
        // A state written without an estimate still gets one, so asking after it never fails.
        job.estimate ??= { seconds: SEED_SECONDS[job.effort] ?? SEED_SECONDS.max, basis: 'seed' };
        found.push(job);
      } catch (error) {
        // A state torn by a crash, or an entry that is no directory, names no job this server can answer for. It
        // stays as it is, and the terminal says so.
        console.error(`tailorings: ${path} names no job — ${error.message}`);
      }
    }
    for (const job of found) {
      if (job.status === 'running') {
        await this.save({
          ...job,
          status: 'failed',
          reason: 'The job was interrupted: the server stopped while it ran.',
          finishedAt: new Date(this.clock()).toISOString()
        });
      } else {
        this.jobs.set(job.id, job);
      }
    }
    const arrival = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));
    this.queue.push(
      ...found
        .filter((job) => job.status === 'queued')
        .sort(arrival)
        .map((job) => job.id)
    );
    this.history = found
      .filter((job) => job.status === 'ready' && Number.isFinite(job.seconds))
      .sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));
    if (this.queue.length) this.drain();
  }
}

/** What is wrong with a letter's defaults, each problem in `ProfileShape`'s form. */
function letterProblems(letter) {
  if (!letter || typeof letter !== 'object' || Array.isArray(letter)) {
    return [
      { path: '', reason: `must be a JSON object with ${Object.keys(LETTER_FIELDS).join(', ')}` }
    ];
  }
  return Object.entries(letter).flatMap(([key, value]) => {
    if (!Object.hasOwn(LETTER_FIELDS, key)) {
      return [
        {
          path: key,
          reason: `is not a field a letter takes: ${Object.keys(LETTER_FIELDS).join(', ')}`
        }
      ];
    }
    const ok = typeof value === 'string' && value.trim() && (key !== 'startDate' || isDate(value));
    return ok ? [] : [{ path: key, reason: `must be ${LETTER_FIELDS[key]}` }];
  });
}

/**
 * Whether a start date is a day the calendar has. The pattern alone takes 2026-02-31, which `Date` then moves to the
 * 3rd of March, and a letter would name a day the owner never wrote (the review of #283).
 */
function isDate(text) {
  if (!DATE.test(text)) return false;
  const [year, month, day = 1] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The problems of a part of the request, each with its path in the request. */
function within(field, problems) {
  return problems.map(({ path, reason }) => ({
    path: path ? (path.startsWith('[') ? `${field}${path}` : `${field}.${path}`) : field,
    reason
  }));
}

/** The first problem, and how many more, as `ProfileStore` words a refused save. */
function summary(problems) {
  const [first] = problems;
  const more = problems.length > 1 ? `, and ${problems.length - 1} more` : '';
  return `${first.path || 'it'} ${first.reason}${more}`;
}

/** The middle value, or the mean of the two middle ones. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Six random hex digits, from the platform's cryptographic source. */
function hex() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(3));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

import { APPLICATION_NAME } from './Applications.js';
import { EFFORTS, MODELS } from './Inference.js';
import { ProfileStore } from './ProfileStore.js';
import { Refusal } from './Refusal.js';

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
const FIELDS = Object.freeze(['advert', ...Object.keys(DEFAULTS)]);
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

/** Until step 5 of #260 lands, a job has nothing to run. */
const NOTHING_TO_RUN = async () => {
  throw new Refusal(
    501,
    'Nothing tailors yet: step 5 of #260 builds the tailoring itself, and this job has nothing to run until it lands.'
  );
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
 * is what lets it survive the server stopping. What the job does is the `work` port; steps 5 to 7 of #260 fill it.
 */
export class Tailorings {
  /**
   * @param {object} ports - What the service reaches the machine through
   * @param {{ readText: Function, writeText: Function, exists: Function, list: Function }} ports.files - The
   *   project's files
   * @param {{ status: Function }} ports.inference - Which backend a run would use, and how it charges
   * @param {(job: object, progress: { update: Function }) => Promise<object>} [ports.work] - What a job does
   * @param {() => number} [ports.clock] - The time, in milliseconds since the epoch
   * @param {() => string} [ports.random] - Six random hex digits, to make an id no one can guess or collide with
   */
  constructor({ files, inference, work = NOTHING_TO_RUN, clock = Date.now, random = hex }) {
    this.files = files;
    this.inference = inference;
    this.work = work;
    this.clock = clock;
    this.random = random;
    this.jobs = new Map();
    this.queue = [];
    this.history = [];
    this.current = null;
    this.running = null;
  }

  /** Where a job's files are, relative to the project. */
  static paths(id) {
    const directory = `applications/${id}`;
    return {
      directory,
      advert: `${directory}/advert.txt`,
      request: `${directory}/request.json`,
      state: `${directory}/state.json`
    };
  }

  /**
   * Reads the jobs an earlier run of the server left, once: a job that was running is marked failed, and the jobs
   * that were waiting are queued again, in their order of arrival.
   * @returns {Promise<void>}
   */
  start() {
    this.started ??= this.recover();
    return this.started;
  }

  /**
   * @param {object} request - The advert's text, and the options #260 names
   * @returns {Promise<object>} The job's id, its status, the estimate and its basis, the backend and its cost, and
   *   the CV the job starts from
   * @throws {Refusal} 422 for a request it cannot take, 503 when no backend could run it
   */
  async create(request) {
    await this.start();
    const { advert, options } = await this.accepted(request);
    const { backend, cost, unavailable } = await this.inference.status();
    if (!backend) {
      const reasons = unavailable.map((entry) => `${entry.backend}: ${entry.reason}`).join('; ');
      throw new Refusal(503, `No inference is available on this machine — ${reasons}.`);
    }

    const id = await this.newId();
    const paths = Tailorings.paths(id);
    const state = {
      id,
      status: 'queued',
      createdAt: new Date(this.clock()).toISOString(),
      model: options.model,
      effort: options.effort,
      backend,
      cost,
      source: ProfileStore.path,
      estimate: this.estimate(options, backend),
      attempts: 0
    };
    await this.files.writeText(paths.advert, advert);
    await this.files.writeText(paths.request, `${JSON.stringify(options, null, 2)}\n`);
    await this.save(state);
    this.queue.push(id);
    this.drain();
    return {
      id,
      status: state.status,
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
    return { ...state, secondsLeft: this.secondsLeft(id) };
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
    const { advert, ...given } = request;
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
    const problems = Object.entries(rules)
      .map(([path, rule]) => ({ path, reason: rule(options[path]) }))
      .filter(({ reason }) => reason)
      .map(({ path, reason }) => ({ path, reason: `${path} ${reason}` }));
    if (problems.length) {
      throw new Refusal(422, 'The tailoring cannot run as asked.', problems);
    }
    return { advert, options };
  }

  /** An id no job or application has: when the job arrived, to the second, and six random hex digits. */
  async newId() {
    const stamp = new Date(this.clock())
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 15);
    for (let tries = 0; tries < 5; tries += 1) {
      const id = `${stamp}-${this.random()}`;
      const taken = this.jobs.has(id) || (await this.files.exists(Tailorings.paths(id).directory));
      if (APPLICATION_NAME.test(id) && !taken) return id;
    }
    throw new Error('no free id for a tailoring job after five tries');
  }

  /**
   * How long a job with these options should take, in seconds: the median of the last ten ready jobs with the same
   * model, effort and backend, attempts included, or the seed until ten exist.
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
    const left = (job) =>
      job.status === 'running'
        ? Math.max(
            0,
            job.estimate.seconds - Math.round((this.clock() - Date.parse(job.startedAt)) / 1000)
          )
        : job.estimate.seconds;
    if (state.status === 'running') return left(state);
    if (state.status !== 'queued') return 0;
    const ahead = [this.current, ...this.queue.slice(0, this.queue.indexOf(id))].filter(Boolean);
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
          // The job's state could not be written. Nothing can answer for it but the terminal.
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

  /** Runs one job and records how it ended. */
  async run(id) {
    const started = this.clock();
    await this.save({
      ...this.jobs.get(id),
      status: 'running',
      startedAt: new Date(started).toISOString()
    });
    const paths = Tailorings.paths(id);
    const job = {
      id,
      directory: paths.directory,
      advert: await this.files.readText(paths.advert),
      options: JSON.parse(await this.files.readText(paths.request)),
      backend: this.jobs.get(id).backend
    };
    const update = (fields) => this.save({ ...this.jobs.get(id), ...fields });

    let ending;
    try {
      ending = { status: 'ready', result: (await this.work(job, { update })) ?? {} };
    } catch (error) {
      if (!(error instanceof Refusal)) console.error(error);
      ending = {
        status: 'failed',
        reason:
          error instanceof Refusal
            ? error.message
            : 'The job failed: the terminal running the server says why.'
      };
    }
    const finished = this.clock();
    const state = {
      ...this.jobs.get(id),
      ...ending,
      finishedAt: new Date(finished).toISOString(),
      seconds: Math.round((finished - started) / 1000)
    };
    await this.save(state);
    if (state.status === 'ready') this.history.push(state);
  }

  /** Writes a job's state, and keeps it as the one this server answers with. */
  async save(state) {
    this.jobs.set(state.id, state);
    await this.files.writeText(
      Tailorings.paths(state.id).state,
      `${JSON.stringify(state, null, 2)}\n`
    );
  }

  /** Reads what an earlier run left in `applications/`. */
  async recover() {
    const found = [];
    for (const name of await this.files.list('applications')) {
      if (!APPLICATION_NAME.test(name)) continue;
      const path = Tailorings.paths(name).state;
      if (!(await this.files.exists(path))) continue;
      try {
        found.push({ ...JSON.parse(await this.files.readText(path)), id: name });
      } catch {
        // A state torn by a crash names no job this server can answer for; the directory stays as it is.
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

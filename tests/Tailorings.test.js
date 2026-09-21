/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { Tailorings, DEFAULTS, SEED_SECONDS } from '../core/Tailorings.js';
import { Refusal } from '../core/Refusal.js';

// Tailoring a CV and writing its letter with Opus 5 at max effort takes minutes, longer than a request should stay
// open (#260). So a tailoring is a job: the call answers at once with an id and an estimate, the job runs in a queue
// one at a time, and its state lives in applications/<id>/, which git ignores, so it survives the server stopping.
// What a job does is a port: steps 5 to 7 of #260 fill it in (#275).
const MANIFEST = JSON.stringify({
  defaultProfile: 'general',
  profiles: { general: { locales: { en: 'profiles/general/en.json' } } },
  layouts: ['nerd', 'spotlight', 'technical']
});
const API = { backend: 'anthropic-api', cost: { kind: 'per-run' }, unavailable: [] };
const PUBLISHED = '{\n  "name": "Ada Lovelace"\n}\n';

/** The project's files, in memory; a directory exists when a file under it does, and lists what is under it. */
const project = (files = {}) => {
  const stored = new Map(
    Object.entries({
      'config/cv-manifest.json': MANIFEST,
      'profiles/general/en.json': PUBLISHED,
      'locales/en/cv.json': '{}',
      'locales/de/cv.json': '{}',
      ...files
    })
  );
  return {
    stored,
    readText: async (path) => {
      if (!stored.has(path)) throw Object.assign(new Error(`no ${path}`), { code: 'ENOENT' });
      return stored.get(path);
    },
    writeText: async (path, text) => {
      stored.set(path, text);
    },
    exists: async (path) =>
      [...stored.keys()].some((key) => key === path || key.startsWith(`${path}/`)),
    list: async (path) => [
      ...new Set(
        [...stored.keys()]
          .filter((key) => key.startsWith(`${path}/`))
          .map((key) => key.slice(path.length + 1).split('/')[0])
      )
    ]
  };
};

/** A work port whose jobs finish when the test says so, one promise per job. */
const controlled = () => {
  const pending = [];
  const work = jest.fn(
    (job) =>
      new Promise((resolve, reject) => {
        pending.push({ job, resolve, reject });
      })
  );
  return { work, pending };
};

const setup = ({
  files = {},
  work,
  fullCv,
  status = API,
  now = { at: Date.UTC(2026, 8, 21, 14, 32, 5) },
  ids
} = {}) => {
  const disk = project(files);
  let serial = 0;
  const tailorings = new Tailorings({
    files: disk,
    inference: { status: async () => status },
    fullCv,
    work,
    clock: () => now.at,
    random: () => (ids ? ids.shift() : `a1b2c${serial++}`)
  });
  return { disk, tailorings, now };
};

const stateOf = (disk, id) => JSON.parse(disk.stored.get(`applications/${id}/state.json`));

/** Lets every promise the queue has settled run its continuation. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('creating a tailoring', () => {
  test('answers at once with the id, the estimate, the backend and its cost, and what the job starts from', async () => {
    const { work } = controlled();
    const { tailorings } = setup({ work });

    // Nothing was ahead of it, so it is running by the time the answer is written, and the answer says so.
    expect(await tailorings.create({ advert: 'Senior iOS Engineer\n' })).toEqual({
      id: '20260921-143205-a1b2c0',
      status: 'running',
      estimateSeconds: SEED_SECONDS.max,
      estimateBasis: 'seed',
      backend: 'anthropic-api',
      cost: { kind: 'per-run' },
      source: 'profiles/general/en.json'
    });
  });

  test('writes the advert, the options with their defaults, and the state under applications/<id>/', async () => {
    const { work } = controlled();
    const { disk, tailorings } = setup({ work });

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer\n', effort: 'high' });

    expect(disk.stored.get(`applications/${id}/advert.txt`)).toBe('Senior iOS Engineer\n');
    expect(JSON.parse(disk.stored.get(`applications/${id}/request.json`))).toEqual({
      ...DEFAULTS,
      effort: 'high',
      letter: {}
    });
    expect(stateOf(disk, id)).toMatchObject({
      id,
      createdAt: '2026-09-21T14:32:05.000Z',
      backend: 'anthropic-api'
    });
    expect(
      [...disk.stored.keys()].filter((path) => !/^(config|locales|profiles)\//.test(path))
    ).toEqual(expect.arrayContaining([expect.stringMatching(/^applications\//)]));
    expect(
      [...disk.stored.keys()].filter(
        (path) => !/^(config|locales|profiles|applications)\//.test(path)
      )
    ).toEqual([]);
  });

  test('behind another job, it is queued', async () => {
    const { tailorings } = setup({ work: controlled().work });

    await tailorings.create({ advert: 'first' });

    expect((await tailorings.create({ advert: 'second' })).status).toBe('queued');
  });

  test('the defaults are the ones #260 names', () => {
    expect(DEFAULTS).toEqual({
      language: 'en',
      model: 'claude-opus-5',
      effort: 'max',
      layout: 'technical',
      auditRetries: 2,
      auditGate: true
    });
  });

  test('an id is one an application name can be, and never one already taken', async () => {
    const { work } = controlled();
    const { tailorings } = setup({
      work,
      files: { 'applications/20260921-143205-aaaaaa/en.json': '{}' },
      ids: ['aaaaaa', 'bbbbbb']
    });

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer' });

    expect(id).toBe('20260921-143205-bbbbbb');
    expect(id).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/);
  });

  test.each([
    [undefined, /JSON object/],
    [[], /JSON object/],
    [{}, /advert/],
    [{ advert: '   ' }, /advert/],
    [{ advert: 42 }, /advert/]
  ])('%j is refused before anything is written', async (request, reason) => {
    const { disk, tailorings } = setup({ work: controlled().work });
    const before = disk.stored.size;

    await expect(tailorings.create(request)).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(reason)
    });
    expect(disk.stored.size).toBe(before);
  });

  test.each([
    ['language', 'fr', /de, en/],
    ['model', 'claude-opus-4-8', /claude-opus-5, claude-sonnet-5, claude-fable-5-1/],
    ['effort', 'extreme', /low, medium, high, xhigh, max/],
    ['layout', 'modern', /nerd, spotlight, technical/],
    ['auditRetries', 6, /0 to 5/],
    ['auditRetries', -1, /0 to 5/],
    ['auditRetries', 1.5, /0 to 5/],
    ['auditRetries', '2', /0 to 5/],
    ['auditGate', 'yes', /true or false/],
    ['auditGate', null, /true or false/]
  ])('%s %j is refused with 422, naming what is accepted', async (field, value, accepted) => {
    const { tailorings } = setup({ work: controlled().work });

    const refusal = await tailorings
      .create({ advert: 'Senior iOS Engineer', [field]: value })
      .catch((error) => error);

    expect(refusal).toBeInstanceOf(Refusal);
    expect(refusal.status).toBe(422);
    expect(refusal.details).toEqual([{ path: field, reason: expect.stringMatching(accepted) }]);
    expect(refusal.message).toMatch(new RegExp(`^The tailoring cannot run as asked: ${field} `));
  });

  test('every problem is listed at once', async () => {
    const { tailorings } = setup({ work: controlled().work });

    const refusal = await tailorings
      .create({ advert: 'x', model: 'gpt', effort: 'none', auditGate: 1 })
      .catch((error) => error);

    expect(refusal.details.map(({ path }) => path)).toEqual(['model', 'effort', 'auditGate']);
  });

  // A misspelt auditGate, silently ignored, runs a job with the gate its caller did not ask for.
  test('a field the API does not know is refused, naming the ones it does', async () => {
    const { tailorings } = setup({ work: controlled().work });

    await expect(
      tailorings.create({ advert: 'Senior iOS Engineer', auditgate: false })
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(
        /auditgate.*advert, cv, letter, language, model, effort, layout/s
      )
    });
  });

  test('with no backend available, the job is refused with each reason rather than queued to fail', async () => {
    const { disk, tailorings } = setup({
      work: controlled().work,
      status: {
        backend: null,
        cost: null,
        unavailable: [
          { backend: 'claude-cli', reason: 'not installed' },
          { backend: 'anthropic-api', reason: 'no key' }
        ]
      }
    });
    const before = disk.stored.size;

    await expect(tailorings.create({ advert: 'Senior iOS Engineer' })).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/claude-cli: not installed; anthropic-api: no key/)
    });
    expect(disk.stored.size).toBe(before);
  });
});

// A tailoring subtracts from a CV that lists everything, so it starts from the full CV its owner keeps outside the
// repository; a request can hand it another; with neither, the published one (#279).
describe('what a job starts from', () => {
  const FULL = {
    name: 'Ada Lovelace',
    relevant_experience: [
      {
        title: 'iOS Engineer',
        company: 'Analytical Engines',
        period: 'January 2020 – March 2024',
        highlights: ['Moved the app to SwiftData.']
      }
    ]
  };
  const keeps = ({ cv = null, letter = null } = {}) => ({
    readCv: async () => ({ cv, where: '~/.config/mycv/full-cv/en.json' }),
    readLetter: async () => ({ letter, where: '~/.config/mycv/full-cv/letter.json' })
  });

  test('the full CV its owner keeps, which the job keeps a copy of and reads when it runs', async () => {
    const { work, pending } = controlled();
    const { disk, tailorings } = setup({ work, fullCv: keeps({ cv: FULL }) });

    const answer = await tailorings.create({ advert: 'Senior iOS Engineer' });
    await flush();

    expect(answer.source).toBe('~/.config/mycv/full-cv/en.json');
    expect(JSON.parse(disk.stored.get(`applications/${answer.id}/source.json`))).toEqual(FULL);
    expect(pending[0].job.cv).toEqual(FULL);
  });

  test('without one, the published CV, and the answer says so', async () => {
    const { work, pending } = controlled();
    const { tailorings } = setup({ work, fullCv: keeps() });

    expect((await tailorings.create({ advert: 'Senior iOS Engineer' })).source).toBe(
      'profiles/general/en.json'
    );
    await flush();
    expect(pending[0].job.cv).toEqual({ name: 'Ada Lovelace' });
  });

  test('a CV in the request replaces both, for that job only', async () => {
    const { work, pending } = controlled();
    const { tailorings } = setup({ work, fullCv: keeps({ cv: FULL }) });
    const given = { name: 'Ada Lovelace', title: 'iOS Engineer' };

    expect((await tailorings.create({ advert: 'x', cv: given })).source).toBe('request');
    expect((await tailorings.create({ advert: 'x' })).source).toBe(
      '~/.config/mycv/full-cv/en.json'
    );
    await flush();
    expect(pending[0].job.cv).toEqual(given);
  });

  test('a CV in the request is not read from a full CV that could not be', async () => {
    const { tailorings } = setup({
      work: controlled().work,
      fullCv: {
        readCv: async () => {
          throw new Refusal(
            503,
            'The full CV at ~/x can be read by other users: set its mode to 600.'
          );
        },
        readLetter: async () => ({ letter: null, where: '~/y' })
      }
    });

    expect((await tailorings.create({ advert: 'x', cv: { name: 'Ada' } })).source).toBe('request');
    await expect(tailorings.create({ advert: 'x' })).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/set its mode to 600/)
    });
  });

  test('a CV in the request without the profile’s shape is refused with every problem, as PUT /api/profile is', async () => {
    const { disk, tailorings } = setup({ work: controlled().work });
    const before = disk.stored.size;

    const refusal = await tailorings
      .create({
        advert: 'x',
        cv: {
          title: 'iOS Engineer',
          relevant_experience: [{ company: 'Analytical Engines' }],
          hobby: 1
        }
      })
      .catch((error) => error);

    expect(refusal.status).toBe(422);
    expect(refusal.details.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['cv.name', 'cv.relevant_experience[0].title', 'cv.hobby'])
    );
    expect(refusal.message).toMatch(
      /^The tailoring cannot run as asked: cv\.name .*, and \d+ more\.$/
    );
    expect(disk.stored.size).toBe(before);
  });

  test('a CV of null is refused, not read as no CV', async () => {
    const { tailorings } = setup({ work: controlled().work });

    await expect(tailorings.create({ advert: 'x', cv: null })).rejects.toMatchObject({
      status: 422,
      details: [{ path: 'cv', reason: 'must be a JSON object' }]
    });
  });

  test('a full CV without the profile’s shape refuses the job, naming its file', async () => {
    const { tailorings } = setup({
      work: controlled().work,
      fullCv: keeps({ cv: { title: 'x' } })
    });

    await expect(tailorings.create({ advert: 'x' })).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(
        /^The full CV at ~\/\.config\/mycv\/full-cv\/en\.json cannot be tailored: name/
      ),
      details: [expect.objectContaining({ path: 'name' })]
    });
  });
});

describe('what a letter is told', () => {
  const keeps = (letter) => ({
    readCv: async () => ({ cv: null, where: '~/.config/mycv/full-cv/en.json' }),
    readLetter: async () => ({ letter, where: '~/.config/mycv/full-cv/letter.json' })
  });
  const DEFAULTS_OF_THE_OWNER = {
    salaryExpectation: '€85,000 a year',
    startDate: '2026-12',
    note: 'Say that I work remotely from Catania.'
  };
  const letterOf = (disk, id) =>
    JSON.parse(disk.stored.get(`applications/${id}/request.json`)).letter;

  test('a leap day is a day', async () => {
    const { disk, tailorings } = setup({ work: controlled().work });

    const { id } = await tailorings.create({ advert: 'x', letter: { startDate: '2028-02-29' } });

    expect(letterOf(disk, id)).toEqual({ startDate: '2028-02-29' });
  });

  test('the defaults its owner keeps', async () => {
    const { disk, tailorings } = setup({
      work: controlled().work,
      fullCv: keeps(DEFAULTS_OF_THE_OWNER)
    });

    const { id } = await tailorings.create({ advert: 'x' });

    expect(letterOf(disk, id)).toEqual(DEFAULTS_OF_THE_OWNER);
  });

  test('with the request’s fields over them, field by field', async () => {
    const { disk, tailorings } = setup({
      work: controlled().work,
      fullCv: keeps(DEFAULTS_OF_THE_OWNER)
    });

    const { id } = await tailorings.create({
      advert: 'x',
      letter: { salaryExpectation: '€90,000 a year', startDate: '2027-01-15' }
    });

    expect(letterOf(disk, id)).toEqual({
      salaryExpectation: '€90,000 a year',
      startDate: '2027-01-15',
      note: 'Say that I work remotely from Catania.'
    });
  });

  test.each([
    [{ salary: '€90,000' }, 'letter.salary', /not a field a letter takes/],
    [{ startDate: 'December' }, 'letter.startDate', /YYYY-MM/],
    [{ startDate: '2026-13' }, 'letter.startDate', /YYYY-MM/],
    [{ startDate: '2026-02-31' }, 'letter.startDate', /YYYY-MM/],
    [{ startDate: '2027-02-29' }, 'letter.startDate', /YYYY-MM/],
    [{ note: '   ' }, 'letter.note', /text/],
    [{ note: 42 }, 'letter.note', /text/],
    ['send it', 'letter', /JSON object/],
    // Optional means left out: a null is not "no letter", and a later tidy-up must not make it one silently.
    [null, 'letter', /JSON object/]
  ])('a letter of %j is refused with 422 at %s', async (letter, path, reason) => {
    const { tailorings } = setup({ work: controlled().work });

    await expect(tailorings.create({ advert: 'x', letter })).rejects.toMatchObject({
      status: 422,
      details: [{ path, reason: expect.stringMatching(reason) }]
    });
  });

  test('defaults that hold something a letter does not take refuse the job, naming their file', async () => {
    const { tailorings } = setup({
      work: controlled().work,
      fullCv: keeps({ ...DEFAULTS_OF_THE_OWNER, startDate: 'soon' })
    });

    await expect(tailorings.create({ advert: 'x' })).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(
        /^The letter's defaults at ~\/\.config\/mycv\/full-cv\/letter\.json cannot be used: startDate/
      )
    });
  });
});

describe('running the queue', () => {
  test('one job runs at a time, in order of arrival', async () => {
    const { work, pending } = controlled();
    const { tailorings } = setup({ work });

    const first = await tailorings.create({ advert: 'first' });
    const second = await tailorings.create({ advert: 'second' });
    await flush();

    expect(work).toHaveBeenCalledTimes(1);
    expect(pending[0].job).toMatchObject({ id: first.id, advert: 'first' });
    expect((await tailorings.status(first.id)).status).toBe('running');
    expect((await tailorings.status(second.id)).status).toBe('queued');

    pending[0].resolve({ report: 'done' });
    await flush();

    expect(work).toHaveBeenCalledTimes(2);
    expect(pending[1].job).toMatchObject({ id: second.id, advert: 'second' });
  });

  test('the job hands the work its advert, its options and the backend it was costed for', async () => {
    const { work, pending } = controlled();
    const { tailorings } = setup({ work });

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer', language: 'de' });
    await flush();

    expect(pending[0].job).toEqual({
      id,
      directory: `applications/${id}`,
      advert: 'Senior iOS Engineer',
      options: { ...DEFAULTS, language: 'de', letter: {} },
      cv: { name: 'Ada Lovelace' },
      backend: 'anthropic-api'
    });
  });

  test('a job that finishes is ready, with what the work produced', async () => {
    const { work, pending } = controlled();
    const { disk, tailorings, now } = setup({ work });

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer' });
    await flush();
    now.at += 400_000;
    pending[0].resolve({ report: { cut: [] }, cost: { usd: 1.2 } });
    await tailorings.idle();

    expect(await tailorings.status(id)).toMatchObject({
      id,
      status: 'ready',
      secondsLeft: 0,
      result: { report: { cut: [] }, cost: { usd: 1.2 } }
    });
    expect(stateOf(disk, id)).toMatchObject({ status: 'ready', seconds: 400 });
  });

  test('a job the work refuses has failed, with the refusal’s reason', async () => {
    const { work, pending } = controlled();
    const { tailorings } = setup({ work });

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer' });
    await flush();
    pending[0].reject(new Refusal(422, 'The model declined the run.'));
    await tailorings.idle();

    expect(await tailorings.status(id)).toMatchObject({
      status: 'failed',
      reason: 'The model declined the run.'
    });
  });

  test('any other failure gives away nothing about the machine, and the queue goes on', async () => {
    const { work, pending } = controlled();
    const { tailorings } = setup({ work });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    const first = await tailorings.create({ advert: 'first' });
    const second = await tailorings.create({ advert: 'second' });
    await flush();
    pending[0].reject(new Error('ENOENT: /home/someone/.config/mycv/full-cv/en.json'));
    await flush();

    expect(await tailorings.status(first.id)).toMatchObject({
      status: 'failed',
      reason: expect.not.stringMatching(/home|ENOENT/)
    });
    expect((await tailorings.status(second.id)).status).toBe('running');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  // A job marked running whose files then could not be read was left running for ever (the review of #276).
  test('a job whose files cannot be read ends failed, and the work never runs', async () => {
    const { work } = controlled();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { tailorings } = setup({
      work,
      files: {
        'applications/20260921-100001-aaaaaa/state.json': JSON.stringify({
          status: 'queued',
          createdAt: '2026-09-21T10:00:01.000Z',
          effort: 'max'
        })
      }
    });

    await tailorings.start();
    await tailorings.idle();

    expect(await tailorings.status('20260921-100001-aaaaaa')).toMatchObject({
      status: 'failed',
      reason: expect.not.stringMatching(/advert\.txt|applications/)
    });
    expect(work).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test('a progress update that lands late never leaves a finished job running on disk', async () => {
    const { disk, tailorings } = setup({
      work: async (job, { update }) => {
        update({ attempts: 1 }); // not awaited, as a callback from a child process would not be
        return { done: true };
      }
    });
    const write = disk.writeText;
    disk.writeText = async (path, text) => {
      if (text.includes('"attempts": 1') && text.includes('"running"')) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return write(path, text);
    };

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer' });
    await tailorings.idle();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stateOf(disk, id)).toMatchObject({ status: 'ready', attempts: 1 });
  });

  test('the work reports its attempts as it makes them', async () => {
    const { tailorings } = setup({
      work: async (job, { update }) => {
        await update({ attempts: 1 });
        await update({ attempts: 2 });
        return {};
      }
    });

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer' });
    await tailorings.idle();

    expect((await tailorings.status(id)).attempts).toBe(2);
  });

  test('a service given no work fails a job at once, saying so', async () => {
    const { tailorings } = setup();

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer' });
    await tailorings.idle();

    expect(await tailorings.status(id)).toMatchObject({
      status: 'failed',
      reason: expect.stringMatching(/built without its work/)
    });
  });
});

describe('the estimate', () => {
  test('counts the jobs ahead, and what is left of the one running', async () => {
    const { work } = controlled();
    const { tailorings, now } = setup({ work });

    await tailorings.create({ advert: 'first' });
    await flush();
    now.at += 100_000;
    const second = await tailorings.create({ advert: 'second', effort: 'low' });

    expect(second.estimateSeconds).toBe(SEED_SECONDS.max - 100 + SEED_SECONDS.low);
    expect((await tailorings.status(second.id)).secondsLeft).toBe(
      SEED_SECONDS.max - 100 + SEED_SECONDS.low
    );
  });

  test('a running job past its estimate has no seconds left, never fewer', async () => {
    const { work } = controlled();
    const { tailorings, now } = setup({ work });

    const { id } = await tailorings.create({ advert: 'first' });
    await flush();
    now.at += (SEED_SECONDS.max + 60) * 1000;

    expect((await tailorings.status(id)).secondsLeft).toBe(0);
  });

  test('is the median of the last ten ready jobs with the same model, effort and backend', async () => {
    const files = {};
    // The first, 5000, is the eleventh from the end: counted, it would move the median.
    const durations = [5000, 900, 200, 300, 400, 500, 600, 700, 800, 1000, 50];
    durations.forEach((seconds, index) => {
      const id = `20260920-0000${String(index).padStart(2, '0')}-aaaaaa`;
      files[`applications/${id}/state.json`] = JSON.stringify({
        id,
        status: 'ready',
        model: 'claude-opus-5',
        effort: 'max',
        backend: 'anthropic-api',
        finishedAt: new Date(Date.UTC(2026, 8, 20, 0, 0, index)).toISOString(),
        seconds
      });
    });
    // Another effort, a failed job and another backend never count.
    files['applications/20260920-000102-bbbbbb/state.json'] = JSON.stringify({
      status: 'ready',
      model: 'claude-opus-5',
      effort: 'max',
      backend: 'claude-cli',
      finishedAt: '2026-09-20T01:00:02.000Z',
      seconds: 5
    });
    files['applications/20260920-000100-bbbbbb/state.json'] = JSON.stringify({
      status: 'ready',
      model: 'claude-opus-5',
      effort: 'low',
      backend: 'anthropic-api',
      finishedAt: '2026-09-20T01:00:00.000Z',
      seconds: 5
    });
    files['applications/20260920-000101-bbbbbb/state.json'] = JSON.stringify({
      status: 'failed',
      model: 'claude-opus-5',
      effort: 'max',
      backend: 'anthropic-api',
      finishedAt: '2026-09-20T01:00:01.000Z',
      seconds: 5
    });
    const { tailorings } = setup({ files, work: controlled().work });

    const answer = await tailorings.create({ advert: 'Senior iOS Engineer' });

    // The last ten: 900 … 50, without the first 5000. Sorted: 50 200 300 400 500 600 700 800 900 1000.
    expect(answer).toMatchObject({ estimateSeconds: 550, estimateBasis: 'measured' });
  });

  test('the jobs this server finishes count towards the next estimate', async () => {
    const { tailorings, now } = setup({
      work: async () => {
        now.at += 300_000;
        return {};
      }
    });

    for (let job = 0; job < 10; job += 1) {
      await tailorings.create({ advert: `advert ${job}` });
      await tailorings.idle();
    }

    expect(await tailorings.create({ advert: 'the eleventh' })).toMatchObject({
      estimateSeconds: 300,
      estimateBasis: 'measured'
    });
  });

  test('with fewer than ten, the seed stands, and says so', async () => {
    const { tailorings } = setup({ work: controlled().work });

    expect(await tailorings.create({ advert: 'x', effort: 'medium' })).toMatchObject({
      estimateSeconds: SEED_SECONDS.medium,
      estimateBasis: 'seed'
    });
  });
});

describe('a restart of the server', () => {
  const saved = (id, state) => ({
    [`applications/${id}/state.json`]: JSON.stringify({ id, ...state }),
    [`applications/${id}/advert.txt`]: `advert of ${id}`,
    [`applications/${id}/request.json`]: JSON.stringify(DEFAULTS),
    [`applications/${id}/source.json`]: PUBLISHED
  });

  test('marks a job that was running failed, as interrupted', async () => {
    const { disk, tailorings } = setup({
      work: controlled().work,
      files: saved('20260921-100000-aaaaaa', {
        status: 'running',
        createdAt: '2026-09-21T10:00:00.000Z'
      })
    });

    await tailorings.start();

    expect(await tailorings.status('20260921-100000-aaaaaa')).toMatchObject({
      status: 'failed',
      reason: expect.stringMatching(/interrupted/)
    });
    expect(stateOf(disk, '20260921-100000-aaaaaa').status).toBe('failed');
  });

  test('queues the jobs that were waiting again, in their order of arrival', async () => {
    const { work, pending } = controlled();
    const { tailorings } = setup({
      work,
      files: {
        ...saved('20260921-100002-bbbbbb', {
          status: 'queued',
          createdAt: '2026-09-21T10:00:02.000Z'
        }),
        ...saved('20260921-100001-aaaaaa', {
          status: 'queued',
          createdAt: '2026-09-21T10:00:01.000Z'
        })
      }
    });

    await tailorings.start();
    await flush();

    expect(pending.map(({ job }) => job.id)).toEqual(['20260921-100001-aaaaaa']);
    expect(pending[0].job.advert).toBe('advert of 20260921-100001-aaaaaa');
    pending[0].resolve({});
    await flush();
    expect(pending.map(({ job }) => job.id)).toEqual([
      '20260921-100001-aaaaaa',
      '20260921-100002-bbbbbb'
    ]);
  });

  test('a waiting job whose state carries no estimate is still answered, with the seed', async () => {
    const { tailorings } = setup({
      work: controlled().work,
      files: {
        ...saved('20260921-100001-aaaaaa', {
          status: 'running',
          createdAt: '2026-09-21T10:00:00.000Z'
        }),
        ...saved('20260921-100002-bbbbbb', {
          status: 'queued',
          effort: 'low',
          createdAt: '2026-09-21T10:00:02.000Z'
        }),
        ...saved('20260921-100003-cccccc', {
          status: 'queued',
          createdAt: '2026-09-21T10:00:03.000Z'
        })
      }
    });

    await tailorings.start();

    expect((await tailorings.status('20260921-100003-cccccc')).secondsLeft).toBe(
      SEED_SECONDS.low + SEED_SECONDS.max
    );
  });

  test('a file where a job’s directory would be is passed over, and the service still answers', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { disk, tailorings } = setup({ work: controlled().work });
    disk.exists = async (path) => {
      if (path === 'applications/notes/state.json') {
        throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
      }
      return [...disk.stored.keys()].some((key) => key === path || key.startsWith(`${path}/`));
    };
    disk.stored.set('applications/notes', 'a stray file');

    await expect(tailorings.start()).resolves.toBeUndefined();
    await expect(tailorings.create({ advert: 'x' })).resolves.toMatchObject({ status: 'running' });
    log.mockRestore();
  });

  test('a recovery that failed is tried again, rather than failing every call after it', async () => {
    const { disk, tailorings } = setup({ work: controlled().work });
    const list = disk.list;
    let calls = 0;
    disk.list = async (path) => {
      calls += 1;
      if (calls === 1) throw new Error('EIO');
      return list(path);
    };

    await expect(tailorings.start()).rejects.toThrow('EIO');
    await expect(tailorings.create({ advert: 'x' })).resolves.toMatchObject({ status: 'running' });
  });

  test('leaves an application that is not a job alone, and a state it cannot read', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { tailorings } = setup({
      work: controlled().work,
      files: {
        'applications/acme/en.json': '{}',
        'applications/acme/advert.txt': 'Senior iOS Engineer',
        'applications/20260921-100000-aaaaaa/state.json': '{ torn'
      }
    });

    await expect(tailorings.start()).resolves.toBeUndefined();
    await expect(tailorings.status('acme')).rejects.toMatchObject({ status: 404 });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/20260921-100000-aaaaaa.*names no job/));
    log.mockRestore();
  });
});

// A ready job's documents, as a recruiter receives them (#303): named for the candidate and the document in the job's
// language, never for the job.
describe('downloading what a job printed', () => {
  const ID = '20260921-100000-aaaaaa';
  const printed = (status, extra = {}) => ({
    [`applications/${ID}/state.json`]: JSON.stringify({
      id: ID,
      status,
      createdAt: '2026-09-21T10:00:00.000Z',
      estimate: { seconds: 1, basis: 'seed' },
      ...extra
    }),
    [`applications/${ID}/request.json`]: JSON.stringify({ ...DEFAULTS, language: 'de' }),
    [`applications/${ID}/de.json`]: JSON.stringify({
      name: 'Ada Lovelace',
      title: 'Senior iOS-Entwicklerin'
    }),
    [`applications/${ID}/out/cv.pdf`]: '%PDF-',
    [`applications/${ID}/out/letter.pdf`]: '%PDF-',
    'locales/de/ui.json': JSON.stringify({ files: { letter: 'Anschreiben' } })
  });
  const withBytes = (files) => {
    const { disk, tailorings } = setup({ work: controlled().work, files });
    disk.readBytes = async (path) => Buffer.from(`bytes of ${path}`);
    return tailorings;
  };

  // Named as the public CV is — the person, the role and the document — so a recruiter never saves two shapes (the
  // product review of #320).
  test('a ready job’s CV and letter, each named as the public CV is, the letter in the job’s language', async () => {
    const tailorings = withBytes(
      printed('ready', {
        result: {
          files: {
            cv: `applications/${ID}/out/cv.pdf`,
            letter: `applications/${ID}/out/letter.pdf`
          }
        }
      })
    );

    expect(await tailorings.cv(ID)).toEqual({
      file: Buffer.from(`bytes of applications/${ID}/out/cv.pdf`),
      type: 'application/pdf',
      filename: 'Ada-Lovelace-Senior-iOS-Entwicklerin-CV.pdf'
    });
    expect((await tailorings.letter(ID)).filename).toBe(
      'Ada-Lovelace-Senior-iOS-Entwicklerin-Anschreiben.pdf'
    );
  });

  test('a document gone from disk since is not found, rather than the server failing', async () => {
    const files = printed('ready', {
      result: { files: { cv: `applications/${ID}/out/cv.pdf` } }
    });
    delete files[`applications/${ID}/out/cv.pdf`];

    await expect(withBytes(files).cv(ID)).rejects.toMatchObject({ status: 404 });
  });

  // A job found running when the server starts was interrupted, and is failed: running is asked of a live one below.
  test.each([
    ['queued', 409],
    ['failed', 404]
  ])('a %s job has nothing to download: %i', async (status, code) => {
    const tailorings = withBytes(printed(status));

    await expect(tailorings.cv(ID)).rejects.toMatchObject({ status: code });
  });

  test('a ready job says where its documents download from', async () => {
    const tailorings = withBytes(
      printed('ready', { result: { files: { cv: 'out/cv.pdf', letter: 'out/letter.pdf' } } })
    );

    expect((await tailorings.status(ID)).downloads).toEqual({
      cv: `/api/tailorings/${ID}/cv`,
      letter: `/api/tailorings/${ID}/letter`
    });
  });

  test('a running job has nothing to download yet: 409', async () => {
    const { tailorings } = setup({ work: controlled().work });

    const { id } = await tailorings.create({ advert: 'Senior iOS Engineer' });

    await expect(tailorings.cv(id)).rejects.toMatchObject({ status: 409 });
  });

  test('a job that printed no letter has no letter to download', async () => {
    const tailorings = withBytes(
      printed('ready', { result: { files: { cv: 'x.pdf', letter: null } } })
    );

    await expect(tailorings.letter(ID)).rejects.toMatchObject({ status: 404 });
  });

  test('an id that names no job is a 404', async () => {
    await expect(withBytes({}).cv('20260921-100000-ffffff')).rejects.toMatchObject({ status: 404 });
  });
});

describe('asking after a job', () => {
  test.each(['20260921-143205-ffffff', '../etc', 'ACME', '', 42, undefined])(
    '%j names no job: 404',
    async (id) => {
      const { tailorings } = setup({ work: controlled().work });

      await expect(tailorings.status(id)).rejects.toMatchObject({ status: 404 });
    }
  );
});

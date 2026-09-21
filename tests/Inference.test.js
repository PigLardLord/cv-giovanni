/**
 * @jest-environment node
 */
import { EFFORTS, Inference, MODELS } from '../core/Inference.js';

// The local app asks a model for help through whichever backend this machine has (#22): the claude CLI,
// on the subscription already paid for, and failing that an API key, paid per run. Which one, and what a
// run on it costs, is known before a run; with neither, a run is refused with the reason for each.

/** A backend that answers as told, and remembers every run. */
const backend = (name, { available = true, reason = `${name} is not set up` } = {}) => {
  const runs = [];
  return {
    runs,
    name,
    cost: { charged: `the way ${name} charges` },
    availability: async () => (available ? { available: true } : { available: false, reason }),
    complete: async (request) => {
      runs.push(request);
      return { text: `${name} answered`, usd: 0.01 };
    }
  };
};
const REQUEST = { system: 'You tailor CVs.', prompt: 'The advert, and the CV.' };

describe('which backend the local app asks', () => {
  test('the claude CLI when it is available, with no key needed', async () => {
    const cli = backend('claude-cli');
    const api = backend('anthropic-api', { available: false, reason: 'no API key' });
    const inference = new Inference([cli, api]);

    expect(await inference.status()).toEqual({
      backend: 'claude-cli',
      cost: cli.cost,
      unavailable: []
    });
    expect(await inference.complete(REQUEST)).toEqual({
      backend: 'claude-cli',
      text: 'claude-cli answered',
      usd: 0.01
    });
    expect(cli.runs).toEqual([REQUEST]);
    expect(api.runs).toEqual([]);
  });

  test('the API key when the CLI is not, saying why the CLI was passed over', async () => {
    const cli = backend('claude-cli', { available: false, reason: 'claude is not installed' });
    const api = backend('anthropic-api');
    const inference = new Inference([cli, api]);

    expect(await inference.status()).toEqual({
      backend: 'anthropic-api',
      cost: api.cost,
      unavailable: [{ backend: 'claude-cli', reason: 'claude is not installed' }]
    });
    expect((await inference.complete(REQUEST)).backend).toBe('anthropic-api');
    expect(cli.runs).toEqual([]);
  });

  test('neither: said before a run, and a run refused with the reason for each', async () => {
    const inference = new Inference([
      backend('claude-cli', { available: false, reason: 'claude is not installed' }),
      backend('anthropic-api', { available: false, reason: 'no API key' })
    ]);

    expect(await inference.status()).toEqual({
      backend: null,
      cost: null,
      unavailable: [
        { backend: 'claude-cli', reason: 'claude is not installed' },
        { backend: 'anthropic-api', reason: 'no API key' }
      ]
    });
    await expect(inference.complete(REQUEST)).rejects.toMatchObject({
      name: 'Refusal',
      status: 503,
      message: expect.stringMatching(/claude is not installed.*no API key/)
    });
  });

  test.each([
    ['no prompt', { system: 'You tailor CVs.', prompt: '  ' }],
    ['no system prompt', { prompt: 'The advert, and the CV.' }],
    ['nothing', undefined]
  ])('a request with %s is refused before any backend runs', async (what, request) => {
    const cli = backend('claude-cli');

    await expect(new Inference([cli]).complete(request)).rejects.toMatchObject({ status: 422 });
    expect(cli.runs).toEqual([]);
  });
});

// #260 runs a job with the model and the effort it asks for, and a job has a deadline, not a request: the port
// passes all three to the backend, and refuses a value no backend is asked to understand, naming the ones it
// accepts (#266).
describe('a run with a model, an effort and a deadline', () => {
  const REQUEST = { system: 'You tailor CVs.', prompt: 'The advert, then the CV.' };
  const recording = () => {
    const runs = [];
    return {
      runs,
      backend: {
        name: 'fake',
        cost: {},
        availability: async () => ({ available: true }),
        complete: async (request) => {
          runs.push(request);
          return { text: 'ok', usd: 0 };
        }
      }
    };
  };

  test('reaches the backend with all three', async () => {
    const { runs, backend } = recording();
    const deadline = Date.now() + 60_000;

    await new Inference([backend]).complete({
      ...REQUEST,
      model: 'claude-opus-5',
      effort: 'max',
      deadline
    });

    expect(runs).toEqual([{ ...REQUEST, model: 'claude-opus-5', effort: 'max', deadline }]);
  });

  test('reaches it with none of them when the run names none, so the backend keeps its own defaults', async () => {
    const { runs, backend } = recording();

    await new Inference([backend]).complete(REQUEST);

    expect(runs).toEqual([REQUEST]);
  });

  test('names the accepted models and efforts', () => {
    expect(MODELS).toEqual(['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1']);
    expect(EFFORTS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  test.each([
    [{ model: 'claude-opus-4-8' }, /claude-opus-5, claude-sonnet-5, claude-fable-5-1/],
    [{ effort: 'extreme' }, /low, medium, high, xhigh, max/],
    [{ deadline: 'soon' }, /deadline/]
  ])('refuses %j before any backend runs, naming what it accepts', async (extra, accepted) => {
    const { runs, backend } = recording();

    const refusal = await new Inference([backend])
      .complete({ ...REQUEST, ...extra })
      .catch((error) => error);

    expect(refusal).toMatchObject({ name: 'Refusal', status: 422 });
    expect(refusal.message).toMatch(accepted);
    expect(runs).toEqual([]);
  });
});

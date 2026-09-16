/**
 * @jest-environment node
 */
import { Inference } from '../core/Inference.js';

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

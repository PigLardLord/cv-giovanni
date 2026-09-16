/**
 * @jest-environment node
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AnthropicApiInference,
  keyFile,
  SONNET_5_PRICES
} from '../adapters/AnthropicApiInference.js';

// The second inference backend is an API key, paid per run (#22). The key lives outside the repository in
// a file only its owner can read. It is sent to the Anthropic API and to nothing else, and it appears in no
// answer, no reason and no refusal. The fetch here is a fake; nothing leaves the test.
const KEY = 'sk-ant-test-0123456789abcdefghijklmnopqrstuvwxyz';
const REQUEST = { system: 'You tailor CVs.', prompt: 'The advert, then the CV.' };

describe('where the API key is kept', () => {
  test('under XDG_CONFIG_HOME when it is set, and under ~/.config when it is not', () => {
    expect(keyFile({ env: { XDG_CONFIG_HOME: '/home/someone/.cfg' }, home: '/home/someone' })).toBe(
      '/home/someone/.cfg/mycv/anthropic-api-key'
    );
    expect(keyFile({ env: {}, home: '/home/someone' })).toBe(
      '/home/someone/.config/mycv/anthropic-api-key'
    );
    expect(keyFile({ env: { XDG_CONFIG_HOME: 'relative/cfg' }, home: '/home/someone' })).toBe(
      '/home/someone/.config/mycv/anthropic-api-key'
    );
  });

  test('never inside the project, which git tracks and the development server serves', () => {
    expect(() =>
      keyFile({
        env: { XDG_CONFIG_HOME: '/work/cv-giovanni/config' },
        home: '/home/someone',
        projectRoot: '/work/cv-giovanni'
      })
    ).toThrow(/inside the project/);
    expect(keyFile({ env: {}, home: '/home/someone', projectRoot: '/work/cv-giovanni' })).toBe(
      '/home/someone/.config/mycv/anthropic-api-key'
    );
  });
});

describe('the Anthropic API as an inference backend', () => {
  let config;
  let file;
  let requests;

  const answering = (status, body) => async (url, init) => {
    requests.push({ url, ...init, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => body };
  };
  const withKey = (mode = 0o600, key = KEY) => {
    mkdirSync(join(config, 'mycv'), { recursive: true });
    writeFileSync(file, `${key}\n`);
    chmodSync(file, mode);
  };

  beforeEach(() => {
    config = mkdtempSync(join(tmpdir(), 'config-'));
    file = join(config, 'mycv', 'anthropic-api-key');
    requests = [];
  });

  afterEach(() => rmSync(config, { recursive: true, force: true }));

  test('is available with a key only its owner can read', async () => {
    withKey();

    expect(await new AnthropicApiInference({ file }).availability()).toEqual({ available: true });
  });

  test.each([
    ['no key file', () => {}, /no API key: put one in .*anthropic-api-key/],
    ['a key file other users can read', () => withKey(0o644), /other users/],
    ['an empty key file', () => withKey(0o600, ''), /empty/]
  ])(
    'is not, with %s, and says what to do without showing the key',
    async (what, arrange, reason) => {
      arrange();

      const state = await new AnthropicApiInference({ file }).availability();

      expect(state).toEqual({ available: false, reason: expect.stringMatching(reason) });
      expect(JSON.stringify(state)).not.toContain(KEY);
    }
  );

  test('sends one message to the Anthropic API with the key, the system prompt cached, and prices the answer', async () => {
    withKey();
    const fetch = answering(200, {
      content: [{ type: 'text', text: 'Tailored copy' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1000,
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 0,
        output_tokens: 2000
      }
    });

    const answer = await new AnthropicApiInference({ file, fetch }).complete(REQUEST);

    // 1,000 × $2 + 10,000 × $2.50 + 2,000 × $10, per million tokens.
    expect(answer).toEqual({ text: 'Tailored copy', usd: 0.047, truncated: false });
    expect(requests).toHaveLength(1);
    const [{ url, method, headers, body }] = requests;
    expect([url, method]).toEqual(['https://api.anthropic.com/v1/messages', 'POST']);
    expect(headers).toEqual({
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    });
    expect(body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      system: [{ type: 'text', text: 'You tailor CVs.', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'The advert, then the CV.' }]
    });
  });

  test('a run that reads the system prompt from the cache costs what a cache read costs', async () => {
    withKey();
    const fetch = answering(200, {
      content: [{ type: 'text', text: 'Again' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 1000, cache_read_input_tokens: 10000, output_tokens: 2000 }
    });

    expect(await new AnthropicApiInference({ file, fetch }).complete(REQUEST)).toEqual({
      text: 'Again',
      usd: 0.024,
      truncated: true
    });
  });

  test('a run the API refuses is refused with what it said, and never with the key', async () => {
    withKey();
    const fetch = answering(401, {
      type: 'error',
      error: { type: 'authentication_error', message: `invalid x-api-key ${KEY}` }
    });

    const refusal = await new AnthropicApiInference({ file, fetch })
      .complete(REQUEST)
      .catch((error) => error);

    expect(refusal).toMatchObject({ name: 'Refusal', status: 502 });
    expect(refusal.message).toContain('invalid x-api-key');
    expect(refusal.message).not.toContain(KEY);
  });

  test('an API it cannot reach is a refusal that names no key', async () => {
    withKey();
    const fetch = async () => {
      throw new Error(`connect ECONNREFUSED, sent with ${KEY}`);
    };

    const refusal = await new AnthropicApiInference({ file, fetch })
      .complete(REQUEST)
      .catch((error) => error);

    expect(refusal).toMatchObject({ status: 502 });
    expect(refusal.message).not.toContain(KEY);
  });

  test('with a key other users can read, nothing is sent at all', async () => {
    withKey(0o644);
    const fetch = answering(200, {});

    await expect(
      new AnthropicApiInference({ file, fetch }).complete(REQUEST)
    ).rejects.toMatchObject({
      status: 503
    });
    expect(requests).toEqual([]);
  });

  test('says how a run is charged before any run, with the prices it counts in', () => {
    const backend = new AnthropicApiInference({ file });

    expect(backend.name).toBe('anthropic-api');
    expect(SONNET_5_PRICES).toEqual({ input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 });
    expect(backend.cost).toEqual({
      charged: 'per run, to the API key',
      model: 'claude-sonnet-5',
      usdPerMillionTokens: SONNET_5_PRICES,
      pricesAsOf: '2026-09-13'
    });
  });
});

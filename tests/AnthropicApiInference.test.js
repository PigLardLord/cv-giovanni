/**
 * @jest-environment node
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AnthropicApiInference,
  PRICES,
  PRICES_AS_OF,
  keyFile
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

  // The API streams its answer as server-sent events. A run at max effort thinks before it answers and can run
  // for minutes; one request held open that long, unstreamed, is what an HTTP timeout ends (#266).
  const events = (list) =>
    list
      .map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      .join('');
  const streamed = ({
    text = 'Tailored copy',
    model = 'claude-sonnet-5',
    stop = 'end_turn',
    details = null,
    usage = { input_tokens: 1000, cache_creation_input_tokens: 10000, cache_read_input_tokens: 0 },
    output = 2000
  } = {}) =>
    events([
      [
        'message_start',
        {
          message: {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { ...usage, output_tokens: 0 }
          }
        }
      ],
      ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { index: 0, delta: { type: 'text_delta', text } }],
      ['content_block_stop', { index: 0 }],
      [
        'message_delta',
        {
          delta: { stop_reason: stop, stop_sequence: null, stop_details: details },
          usage: { output_tokens: output }
        }
      ],
      ['message_stop', {}]
    ]);
  const recorded = (url, init) => {
    requests.push({
      url: String(url),
      method: init.method,
      headers: new Headers(init.headers),
      body: JSON.parse(init.body)
    });
  };
  const answering = (sse) => async (url, init) => {
    recorded(url, init);
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const failing = (status, body) => async (url, init) => {
    recorded(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    });
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

  test('streams one message with the key, the model, the effort and the system prompt cached, and prices it at the model’s rates', async () => {
    withKey();
    const fetch = answering(streamed({ model: 'claude-opus-5' }));

    const answer = await new AnthropicApiInference({ file, fetch }).complete({
      ...REQUEST,
      model: 'claude-opus-5',
      effort: 'max'
    });

    // 1,000 × $5 + 10,000 × $6.25 + 2,000 × $25, per million tokens: Opus 5's rates, not Sonnet's.
    expect(answer).toEqual({
      text: 'Tailored copy',
      usd: 0.1175,
      truncated: false,
      model: 'claude-opus-5'
    });
    expect(requests).toHaveLength(1);
    const [{ url, method, headers, body }] = requests;
    expect([url, method]).toEqual(['https://api.anthropic.com/v1/messages', 'POST']);
    expect(headers.get('x-api-key')).toBe(KEY);
    expect(headers.get('anthropic-version')).toBe('2023-06-01');
    // Room for the longest answer: at max effort the thinking counts against max_tokens, and 8,192 truncated it.
    expect(body).toEqual({
      model: 'claude-opus-5',
      max_tokens: 128000,
      stream: true,
      output_config: { effort: 'max' },
      system: [{ type: 'text', text: 'You tailor CVs.', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'The advert, then the CV.' }]
    });
  });

  test('a run that names no model or effort runs the backend’s model and leaves the effort to the API', async () => {
    withKey();
    const fetch = answering(streamed());

    const answer = await new AnthropicApiInference({ file, fetch }).complete(REQUEST);

    // 1,000 × $2 + 10,000 × $2.50 + 2,000 × $10, per million tokens.
    expect(answer).toEqual({
      text: 'Tailored copy',
      usd: 0.047,
      truncated: false,
      model: 'claude-sonnet-5'
    });
    expect(requests[0].body.model).toBe('claude-sonnet-5');
    expect(requests[0].body).not.toHaveProperty('output_config');
  });

  test('a run that reads the system prompt from the cache costs what a cache read costs', async () => {
    withKey();
    const fetch = answering(
      streamed({
        text: 'Again',
        stop: 'max_tokens',
        usage: { input_tokens: 1000, cache_read_input_tokens: 10000 }
      })
    );

    expect(await new AnthropicApiInference({ file, fetch }).complete(REQUEST)).toEqual({
      text: 'Again',
      usd: 0.024,
      truncated: true,
      model: 'claude-sonnet-5'
    });
  });

  // A refusal is a stop, not an empty answer: it ends the run with what the model said about it (#266). No
  // server-side fallback to another model — #260 names the model and its cost before the run, and a fallback
  // would change both.
  test('a run the model refuses ends with the refusal’s category and explanation, never the key', async () => {
    withKey();
    const fetch = answering(
      streamed({
        text: '',
        model: 'claude-opus-5',
        stop: 'refusal',
        details: { type: 'refusal', category: 'cyber', explanation: `declined, near ${KEY}` }
      })
    );

    const refusal = await new AnthropicApiInference({ file, fetch })
      .complete({ ...REQUEST, model: 'claude-opus-5' })
      .catch((error) => error);

    expect(refusal).toMatchObject({ name: 'Refusal', status: 422 });
    expect(refusal.message).toMatch(/cyber/);
    expect(refusal.message).toMatch(/declined/);
    expect(refusal.message).not.toContain(KEY);
  });

  test('a run the API refuses is refused with what it said, and never with the key', async () => {
    withKey();
    const fetch = failing(401, {
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
    const fetch = answering(streamed());

    await expect(
      new AnthropicApiInference({ file, fetch }).complete(REQUEST)
    ).rejects.toMatchObject({
      status: 503
    });
    expect(requests).toEqual([]);
  });

  test('a model it has no prices for is refused before anything is sent: its cost could not be stated', async () => {
    withKey();
    const fetch = answering(streamed());

    await expect(
      new AnthropicApiInference({ file, fetch }).complete({ ...REQUEST, model: 'claude-opus-4-8' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/claude-opus-5/) });
    expect(requests).toEqual([]);
  });

  test('a run whose deadline has passed is refused before anything is sent', async () => {
    withKey();
    const fetch = answering(streamed());

    await expect(
      new AnthropicApiInference({ file, fetch }).complete({ ...REQUEST, deadline: Date.now() - 1 })
    ).rejects.toMatchObject({ status: 504, message: expect.stringMatching(/deadline/) });
    expect(requests).toEqual([]);
  });

  // The SDK reads ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN and ANTHROPIC_CUSTOM_HEADERS from the environment. A
  // shell that routes Claude Code through a gateway would have sent this file's key to that gateway (the review of
  // #268). The destination and the credential are this adapter's, whatever the shell says.
  test('sends the key to api.anthropic.com and nowhere else, whatever the environment names', async () => {
    withKey();
    const fetch = answering(streamed());
    const saved = { ...process.env };
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example.test/proxy';
    process.env.ANTHROPIC_AUTH_TOKEN = 'a-token-from-the-shell';
    try {
      await new AnthropicApiInference({ file, fetch }).complete(REQUEST);
    } finally {
      for (const name of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN']) {
        if (name in saved) process.env[name] = saved[name];
        else delete process.env[name];
      }
    }

    expect(requests[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(requests[0].headers.get('authorization')).toBeNull();
    expect(requests[0].headers.get('x-api-key')).toBe(KEY);
  });

  // The SDK's timeout ends when the answer's headers arrive, and a run at max effort spends its minutes after
  // that, in the stream. A deadline that stopped only the handshake would let a stalled stream hold a job's queue
  // for ever (the review of #268).
  test('a stream still running at the deadline is stopped there', async () => {
    withKey();
    const fetch = async (url, init) => {
      recorded(url, init);
      const opening = new TextEncoder().encode(streamed().split('event: content_block_start')[0]);
      // As a real fetch does: the body opens, never ends, and a read in progress fails when the signal aborts.
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(opening);
          init.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('The operation was aborted.', 'AbortError'))
          );
        }
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const started = Date.now();

    const refusal = await new AnthropicApiInference({ file, fetch })
      .complete({ ...REQUEST, deadline: Date.now() + 300 })
      .catch((error) => error);

    expect(refusal).toMatchObject({ name: 'Refusal', status: 502 });
    expect(refusal.message).toMatch(/in time/);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  // A refusal is billed — the system prompt was read, and whatever was written before the stop — and a job sums
  // its cost over its attempts, so the refusal carries its price (the review of #268).
  test('a refused run still says what it cost', async () => {
    withKey();
    const fetch = answering(
      streamed({
        text: '',
        model: 'claude-opus-5',
        stop: 'refusal',
        details: { type: 'refusal', category: null },
        output: 0
      })
    );

    const refusal = await new AnthropicApiInference({ file, fetch })
      .complete({ ...REQUEST, model: 'claude-opus-5' })
      .catch((error) => error);

    // 1,000 × $5 + 10,000 × $6.25, per million tokens, and no output.
    expect(refusal).toMatchObject({ status: 422, usd: 0.0675 });
    expect(refusal.message).toMatch(/gave no reason/);
  });

  // How the stream can fail, pinned so that a new version of the SDK cannot change it unnoticed: each ends the run,
  // and none carries the key or passes a partial answer off as a whole one.
  describe('a stream that fails', () => {
    const cut = (text) => async (url, init) => {
      recorded(url, init);
      return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };

    test('before its end is a refusal, not the half it sent', async () => {
      withKey();
      const halfway = streamed().split('event: message_delta')[0];

      await expect(
        new AnthropicApiInference({ file, fetch: cut(halfway) }).complete(REQUEST)
      ).rejects.toMatchObject({ name: 'Refusal', status: 502 });
    });

    test('with an error event is a refusal with what it said, never the key', async () => {
      withKey();
      const opening = streamed().split('event: content_block_start')[0];
      const error = `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: { type: 'overloaded_error', message: `Overloaded, near ${KEY}` }
      })}\n\n`;

      const refusal = await new AnthropicApiInference({ file, fetch: cut(opening + error) })
        .complete(REQUEST)
        .catch((failure) => failure);

      expect(refusal).toMatchObject({ name: 'Refusal', status: 502 });
      expect(refusal.message).toMatch(/Overloaded/);
      expect(refusal.message).not.toContain(KEY);
    });

    test('with its connection reset is a refusal that names no key', async () => {
      withKey();
      const fetch = async (url, init) => {
        recorded(url, init);
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(streamed().split('event: content_block_start')[0])
            );
            controller.error(new Error(`socket hang up, with ${KEY}`));
          }
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        });
      };

      const refusal = await new AnthropicApiInference({ file, fetch })
        .complete(REQUEST)
        .catch((failure) => failure);

      expect(refusal).toMatchObject({ name: 'Refusal', status: 502 });
      expect(refusal.message).not.toContain(KEY);
    });
  });

  // Prices as platform.claude.com lists them, per million tokens: base input, a five-minute cache write
  // (1.25× input), a cache read (0.1× input, 0.025× on Fable 5.1) and output.
  test('says how a run is charged before any run, with the prices of every model it runs', () => {
    const backend = new AnthropicApiInference({ file });

    expect(backend.name).toBe('anthropic-api');
    expect(PRICES).toEqual({
      'claude-opus-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
      'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
      'claude-fable-5-1': { input: 10, cacheWrite: 12.5, cacheRead: 0.25, output: 50 }
    });
    expect(backend.cost).toEqual({
      charged: 'per run, to the API key',
      model: 'claude-sonnet-5',
      usdPerMillionTokens: PRICES,
      pricesAsOf: PRICES_AS_OF
    });
  });
});

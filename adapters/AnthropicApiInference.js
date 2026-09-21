import { readFile, stat } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { Refusal } from '../core/Refusal.js';
import { configFile } from './ConfigDirectory.js';

/**
 * The prices of every model a run may ask for, in US dollars per million tokens: base input, a five-minute cache
 * write (1.25× input), a cache read (0.1× input, 0.025× on Fable 5.1) and output. A job's cost is stated before it
 * runs, so it has to be true for the model the job names and not only for Sonnet (#266).
 */
export const PRICES = Object.freeze({
  'claude-opus-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  'claude-fable-5-1': { input: 10, cacheWrite: 12.5, cacheRead: 0.25, output: 50 }
});

/** When the prices above were read from platform.claude.com's pricing page. */
export const PRICES_AS_OF = '2026-09-21';

/**
 * The longest answer a run may give, in tokens: the output ceiling of every model above. At max effort the model
 * thinks before it answers and the thinking counts against it, so the 8,192 once sized for a Sonnet answer
 * truncated. A request that long is streamed, since held open unstreamed it is what an HTTP timeout ends.
 */
const MAX_OUTPUT_TOKENS = 128000;

/** How long a run with no deadline may take. */
const NO_DEADLINE = 60 * 60 * 1000;

/**
 * Where the API key is kept: `$XDG_CONFIG_HOME/mycv/anthropic-api-key`, or under `~/.config` when that is unset
 * or not absolute. Never inside the project, which git tracks and the development server serves.
 * @param {{ env?: object, home?: string, projectRoot?: string }} [where] - The environment, the home directory,
 *   and the project the key must stay out of
 * @returns {string} The key's file
 * @throws {Error} When that file would be inside the project
 */
export function keyFile(where = {}) {
  return configFile('anthropic-api-key', { ...where, what: "API key's file" });
}

/**
 * The Anthropic API as an inference backend (#22), paid per run with a key kept outside the repository.
 *
 * The key is read from its file for each run and sent in one header to api.anthropic.com, and nowhere else. The
 * call is the official SDK's, handed this adapter's `fetch` so that a test reaches no network, with no retries of
 * its own: a job decides whether a run is worth another attempt.
 * A file other users can read is refused, before anything is sent: a key is a bill anyone who reads it can run
 * up. No answer, reason or refusal carries the key, even when what the API said contains it. The system
 * prompt is marked for caching, because the CV and the rules stay the same across runs and only the advert
 * changes.
 */
export class AnthropicApiInference {
  /**
   * @param {{ file: string, fetch?: Function, model?: string, prices?: object, maxTokens?: number }} options -
   *   The key's file, how to reach the API, the model a run that names none gets, the prices of every model, and
   *   the longest answer
   */
  constructor({
    file,
    fetch = globalThis.fetch,
    model = 'claude-sonnet-5',
    prices = PRICES,
    maxTokens = MAX_OUTPUT_TOKENS
  } = {}) {
    this.file = file;
    this.fetch = fetch;
    this.model = model;
    this.prices = prices;
    this.maxTokens = maxTokens;
  }

  get name() {
    return 'anthropic-api';
  }

  /** How a run is charged, known before any run. */
  get cost() {
    return {
      charged: 'per run, to the API key',
      model: this.model,
      usdPerMillionTokens: this.prices,
      pricesAsOf: PRICES_AS_OF
    };
  }

  /** @returns {Promise<{ available: boolean, reason?: string }>} Whether a key is there, and only its owner's */
  async availability() {
    let info;
    try {
      info = await stat(this.file);
    } catch (error) {
      return {
        available: false,
        reason:
          error.code === 'ENOENT'
            ? `no API key: put one in ${this.file}, readable only by you (mode 600)`
            : `the API key's file ${this.file} cannot be read`
      };
    }
    if (info.mode & 0o077) {
      return {
        available: false,
        reason: `the API key's file ${this.file} can be read by other users: set its mode to 600`
      };
    }
    if (!(await this.key())) {
      return { available: false, reason: `the API key's file ${this.file} is empty` };
    }
    return { available: true };
  }

  async key() {
    return (await readFile(this.file, 'utf8')).trim();
  }

  /**
   * @param {{ system: string, prompt: string, model?: string, effort?: string, deadline?: number }} request - What
   *   the model is told and asked, which model, how hard it thinks, and by when it must have answered
   * @returns {Promise<{ text: string, usd: number, truncated: boolean, model: string }>} The answer, its price,
   *   whether it stopped at the length limit, and the model that gave it
   * @throws {Refusal} 422 for a model with no prices or a run the model declined, 503 with no usable key, 504 when
   *   the deadline passed before the run began, 502 when the API does not answer
   */
  async complete({ system, prompt, model = this.model, effort, deadline }) {
    const prices = this.prices[model];
    if (!prices) {
      throw new Refusal(
        422,
        `The API backend has no prices for ${model}, so it cannot say what the run would cost; it runs ` +
          `${Object.keys(this.prices).join(', ')}.`
      );
    }
    const timeout = deadline === undefined ? NO_DEADLINE : deadline - Date.now();
    if (timeout <= 0) {
      throw new Refusal(504, "The run's deadline had passed before it started.");
    }
    const { available, reason } = await this.availability();
    if (!available) throw new Refusal(503, `The API key cannot be used: ${reason}.`);
    const key = await this.key();
    const hidden = (text) => String(text).split(key).join('[the key]');

    // The destination and the credential are this adapter's, whatever the shell says: the SDK would otherwise take
    // ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN from the environment, and a shell that routes Claude Code through
    // a gateway would send this file's key to it. ANTHROPIC_CUSTOM_HEADERS has no off switch, but with the
    // destination pinned it only adds headers bound for api.anthropic.com. ANTHROPIC_LOG=debug in the shell makes
    // the SDK print each request's body — the CV and the advert — to the server's console, headers redacted.
    const client = new Anthropic({
      apiKey: key,
      authToken: null,
      baseURL: 'https://api.anthropic.com',
      fetch: this.fetch,
      maxRetries: 0,
      timeout
    });
    // The SDK's timeout ends when the answer's headers arrive; a run at max effort spends its minutes after that, in
    // the stream. The deadline holds for the whole run, stream included.
    const signal = AbortSignal.timeout(timeout);
    let message;
    try {
      message = await client.messages
        .stream(
          {
            model,
            max_tokens: this.maxTokens,
            ...(effort !== undefined && { output_config: { effort } }),
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: prompt }]
          },
          { signal }
        )
        .finalMessage();
    } catch (error) {
      // Before the APIError branch: an aborted stream is an APIError too, and would read as the API refusing.
      if (error instanceof Anthropic.APIUserAbortError || signal.aborted) {
        throw new Refusal(502, `The Anthropic API did not answer in time (${timeout} ms).`);
      }
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new Refusal(502, `The Anthropic API did not answer in time (${timeout} ms).`);
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new Refusal(502, 'The Anthropic API could not be reached.');
      }
      if (error instanceof Anthropic.APIError) {
        throw new Refusal(502, `The Anthropic API refused the run: ${hidden(error.message)}`);
      }
      throw new Refusal(
        502,
        `The Anthropic API's answer could not be read: ${hidden(error.message)}`
      );
    }

    // A refusal is a stop, not an empty answer, and ends the run with what the model said about it. There is no
    // fallback to another model: the job named the model, and stated its cost, before it ran.
    // A refusal is billed — the system prompt was read, and whatever was written before the stop — and a job sums
    // its cost over its attempts, so the refusal carries its price.
    if (message.stop_reason === 'refusal') {
      const { category, explanation } = message.stop_details || {};
      throw Object.assign(
        new Refusal(
          422,
          `The model declined the run${category ? ` (${category})` : ''}: ` +
            `${hidden(explanation || 'it gave no reason')}.`
        ),
        { usd: priced(message.usage, prices) }
      );
    }
    return {
      text: (message.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''),
      usd: priced(message.usage, prices),
      truncated: message.stop_reason === 'max_tokens',
      model
    };
  }
}

/** A run's price from the usage the API reported and the model's prices, to a millionth of a dollar. */
function priced(usage = {}, prices) {
  const tokens = (field) => (Number.isFinite(usage?.[field]) ? usage[field] : 0);
  const usd =
    (tokens('input_tokens') * prices.input +
      tokens('cache_creation_input_tokens') * prices.cacheWrite +
      tokens('cache_read_input_tokens') * prices.cacheRead +
      tokens('output_tokens') * prices.output) /
    1e6;
  return Math.round(usd * 1e6) / 1e6;
}

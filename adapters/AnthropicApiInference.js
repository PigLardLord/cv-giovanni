import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Refusal } from '../core/Refusal.js';

/**
 * Claude Sonnet 5's prices, in US dollars per million tokens, as platform.claude.com/docs/en/about-claude/pricing
 * listed them on 13 September 2026: base input, a five-minute cache write, a cache read, and output.
 */
export const SONNET_5_PRICES = { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 };

/**
 * Where the API key is kept: `$XDG_CONFIG_HOME/mycv/anthropic-api-key`, or under `~/.config` when that is unset
 * or not absolute. Never inside the project, which git tracks and the development server serves.
 * @param {{ env?: object, home?: string, projectRoot?: string }} [where] - The environment, the home directory,
 *   and the project the key must stay out of
 * @returns {string} The key's file
 * @throws {Error} When that file would be inside the project
 */
export function keyFile({ env = process.env, home = homedir(), projectRoot } = {}) {
  const base =
    env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME)
      ? env.XDG_CONFIG_HOME
      : join(home, '.config');
  const file = join(base, 'mycv', 'anthropic-api-key');
  if (projectRoot) {
    const inside = relative(resolve(projectRoot), resolve(file));
    if (!inside.startsWith('..') && !isAbsolute(inside)) {
      throw new Error(
        `The API key's file would be inside the project, at ${file}: keep it outside the repository.`
      );
    }
  }
  return file;
}

/**
 * The Anthropic API as an inference backend (#22), paid per run with a key kept outside the repository.
 *
 * The key is read from its file for each run and sent in one header to api.anthropic.com, and nowhere else.
 * A file other users can read is refused, before anything is sent: a key is a bill anyone who reads it can run
 * up. No answer, reason or refusal carries the key, even when what the API said contains it. The system
 * prompt is marked for caching, because the CV and the rules stay the same across runs and only the advert
 * changes.
 */
export class AnthropicApiInference {
  /**
   * @param {{ file: string, fetch?: Function, model?: string, prices?: object, maxTokens?: number }} options -
   *   The key's file, how to reach the API, the model, its prices, and the longest answer
   */
  constructor({
    file,
    fetch = globalThis.fetch,
    model = 'claude-sonnet-5',
    prices = SONNET_5_PRICES,
    maxTokens = 8192
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
      pricesAsOf: '2026-09-13'
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
   * @param {{ system: string, prompt: string }} request - What the model is told, and asked
   * @returns {Promise<{ text: string, usd: number, truncated: boolean }>} The answer, its price, and whether
   *   it stopped at the length limit
   * @throws {Refusal} 503 with no usable key, 502 when the API does not answer
   */
  async complete({ system, prompt }) {
    const { available, reason } = await this.availability();
    if (!available) throw new Refusal(503, `The API key cannot be used: ${reason}.`);
    const key = await this.key();
    const hidden = (text) => String(text).split(key).join('[the key]');

    let response;
    try {
      response = await this.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: prompt }]
        })
      });
    } catch {
      throw new Refusal(502, 'The Anthropic API could not be reached.');
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const said = body?.error?.message || `it answered ${response.status}`;
      throw new Refusal(502, `The Anthropic API refused the run: ${hidden(said)}`);
    }
    return {
      text: (body?.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''),
      usd: this.priced(body?.usage),
      truncated: body?.stop_reason === 'max_tokens'
    };
  }

  /** A run's price from the usage the API reported, to a millionth of a dollar. */
  priced(usage = {}) {
    const tokens = (field) => (Number.isFinite(usage?.[field]) ? usage[field] : 0);
    const usd =
      (tokens('input_tokens') * this.prices.input +
        tokens('cache_creation_input_tokens') * this.prices.cacheWrite +
        tokens('cache_read_input_tokens') * this.prices.cacheRead +
        tokens('output_tokens') * this.prices.output) /
      1e6;
    return Math.round(usd * 1e6) / 1e6;
  }
}

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Refusal } from '../core/Refusal.js';

/** How every run is made: one answer in print mode, as JSON, with nothing the model could act with. */
const RESTRICTED = [
  '-p',
  '--output-format',
  'json',
  '--tools',
  '',
  '--strict-mcp-config',
  '--no-session-persistence'
];

/**
 * Runs a command with `input` on stdin; resolves how it ended, and never rejects. A run past `timeout` is asked
 * to stop, and killed `grace` later if it has not: a process that ignores SIGTERM would otherwise hold the run,
 * and the directory made for it, for ever.
 */
function run(command, args, { cwd, input = '', timeout, grace = 5 * 1000 }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killer;
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killer = setTimeout(() => child.kill('SIGKILL'), grace);
    }, timeout);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(killer);
      resolve({ code: null, stdout, stderr, error, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(killer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

const firstLine = (text) => String(text).trim().split('\n')[0].slice(0, 300);

/**
 * The local claude CLI as an inference backend (#22): whatever this machine's CLI is signed in to, which for
 * a Claude subscription means no charge per run.
 *
 * `--bare` would be the tidy way to run it, but bare mode never reads the subscription's login, only an API
 * key. So the CLI runs in its normal mode and restricted instead: no built-in tools, no MCP servers, no saved
 * session, and in an empty directory made for the run and removed after it, so no project's CLAUDE.md,
 * settings or `.mcp.json` is picked up. What the user configured in their own `~/.claude` still applies, as
 * it does to every claude run on this machine. The prompt goes in on stdin, so a long advert and CV never
 * meet the limit on an argument's length.
 */
export class ClaudeCliInference {
  /**
   * @param {{ command?: string, model?: string, timeout?: number, grace?: number }} [options] - The executable,
   *   the model alias, how long a run may take in milliseconds, and how long a run past it has to stop before it
   *   is killed
   */
  constructor({
    command = 'claude',
    model = 'sonnet',
    timeout = 5 * 60 * 1000,
    grace = 5 * 1000
  } = {}) {
    this.command = command;
    this.model = model;
    this.timeout = timeout;
    this.grace = grace;
  }

  get name() {
    return 'claude-cli';
  }

  /** How a run is charged, known before any run. */
  get cost() {
    return {
      charged: 'by whatever the claude CLI on this machine is signed in to',
      note: 'A Claude subscription adds no charge per run; an API key the CLI itself is set up with is charged per run.'
    };
  }

  /** @returns {Promise<{ available: boolean, reason?: string }>} Whether claude runs here */
  async availability() {
    const { code } = await run(this.command, ['--version'], {
      cwd: tmpdir(),
      timeout: 10 * 1000
    });
    return code === 0
      ? { available: true }
      : { available: false, reason: 'the claude CLI is not installed, or not on PATH' };
  }

  /**
   * @param {{ system: string, prompt: string }} request - What the model is told, and asked
   * @returns {Promise<{ text: string, usd: number|null }>} The answer, and the CLI's own estimate of its cost
   * @throws {Refusal} 502 when the CLI does not answer
   */
  async complete({ system, prompt }) {
    const cwd = await mkdtemp(join(tmpdir(), 'mycv-inference-'));
    try {
      const { code, stdout, stderr, timedOut } = await run(
        this.command,
        [...RESTRICTED, '--model', this.model, '--system-prompt', system],
        { cwd, input: prompt, timeout: this.timeout, grace: this.grace }
      );
      if (timedOut) {
        throw new Refusal(502, `The claude CLI did not answer in time (${this.timeout} ms).`);
      }
      let answer = null;
      try {
        answer = JSON.parse(stdout);
      } catch {
        answer = null;
      }
      if (code !== 0 || !answer || answer.is_error || typeof answer.result !== 'string') {
        const said = answer?.result || stderr || stdout || `it exited with ${code}`;
        throw new Refusal(502, `The claude CLI did not answer: ${firstLine(said)}`);
      }
      return {
        text: answer.result,
        usd: typeof answer.total_cost_usd === 'number' ? answer.total_cost_usd : null
      };
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
}

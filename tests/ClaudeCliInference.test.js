/**
 * @jest-environment node
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCliInference } from '../adapters/ClaudeCliInference.js';

// The local claude CLI answers on the subscription this machine is signed in to (#22). It runs restricted:
// no tools, no MCP servers, no saved session, in an empty directory of its own. These fakes stand in for it,
// so no test sends anything anywhere.
describe('the claude CLI as an inference backend', () => {
  let bin;
  const REQUEST = { system: 'You tailor CVs.', prompt: 'The advert, then the CV.\n' };

  /** A fake `claude`: answers --version, and otherwise records how it was run before doing `then`. */
  const fake = (name, then) => {
    const path = join(bin, name);
    writeFileSync(
      path,
      `#!/usr/bin/env node
const { readdirSync, readFileSync, writeFileSync } = require('node:fs');
if (process.argv[2] === '--version') { console.log('2.1.263 (Claude Code)'); process.exit(0); }
const stdin = readFileSync(0, 'utf8');
writeFileSync(${JSON.stringify(join(bin, `${name}.json`))}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), entries: readdirSync(process.cwd()), stdin }));
${then}
`
    );
    chmodSync(path, 0o755);
    return path;
  };
  const invocation = (name) => JSON.parse(readFileSync(join(bin, `${name}.json`), 'utf8'));

  beforeEach(() => {
    bin = mkdtempSync(join(tmpdir(), 'fake-claude-'));
  });

  afterEach(() => rmSync(bin, { recursive: true, force: true }));

  test('is available when claude answers --version', async () => {
    const command = fake('claude', 'process.exit(0);');

    expect(await new ClaudeCliInference({ command }).availability()).toEqual({ available: true });
  });

  test('is not, when there is no claude to run, and says so', async () => {
    const backend = new ClaudeCliInference({ command: join(bin, 'nowhere', 'claude') });

    expect(await backend.availability()).toEqual({
      available: false,
      reason: expect.stringMatching(/not installed/)
    });
  });

  test('answers in print mode with no tools, no MCP servers and no saved session, the prompt on stdin', async () => {
    const command = fake(
      'claude',
      `console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Tailored copy', total_cost_usd: 0.0123, session_id: 'x' }));`
    );

    expect(await new ClaudeCliInference({ command }).complete(REQUEST)).toEqual({
      text: 'Tailored copy',
      usd: 0.0123
    });
    const { args, stdin } = invocation('claude');
    expect(args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--tools',
      '',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--model',
      'sonnet',
      '--system-prompt',
      'You tailor CVs.'
    ]);
    expect(stdin).toBe(REQUEST.prompt);
  });

  // #260 runs Opus 5 at max effort by default; the CLI takes both per run (#266).
  test('runs the model and the effort a run names', async () => {
    const command = fake(
      'claude',
      `console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Tailored copy', total_cost_usd: 0.5, session_id: 'x' }));`
    );

    await new ClaudeCliInference({ command }).complete({
      ...REQUEST,
      model: 'claude-opus-5',
      effort: 'max'
    });

    const { args } = invocation('claude');
    expect(args.slice(args.indexOf('--model'))).toEqual([
      '--model',
      'claude-opus-5',
      '--effort',
      'max',
      '--system-prompt',
      'You tailor CVs.'
    ]);
  });

  // A job has a deadline, and a run inside it has what is left of it: a fixed five minutes was sized for a Sonnet
  // answer, and Opus 5 at max effort thinks for longer than that (#266).
  test('a run is stopped at its deadline, not at a fixed limit', async () => {
    const command = fake('claude', 'setTimeout(() => {}, 10000);');
    const started = Date.now();

    await expect(
      new ClaudeCliInference({ command }).complete({ ...REQUEST, deadline: Date.now() + 400 })
    ).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/time/) });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('a run whose deadline has passed is refused before anything runs', async () => {
    const command = fake('claude', `console.log('{}');`);

    await expect(
      new ClaudeCliInference({ command }).complete({ ...REQUEST, deadline: Date.now() - 1 })
    ).rejects.toMatchObject({ status: 504, message: expect.stringMatching(/deadline/) });
    expect(existsSync(join(bin, 'claude.json'))).toBe(false);
  });

  test('runs in an empty directory made for the run, gone once it answers', async () => {
    const command = fake(
      'claude',
      `console.log(JSON.stringify({ is_error: false, result: 'ok' }));`
    );

    await new ClaudeCliInference({ command }).complete(REQUEST);

    const { cwd, entries } = invocation('claude');
    expect(entries).toEqual([]);
    expect(cwd.startsWith(tmpdir())).toBe(true);
    expect(existsSync(cwd)).toBe(false);
  });

  test('a run the CLI could not answer is refused with what it said', async () => {
    const command = fake(
      'claude',
      `console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in · Please run /login' })); process.exit(1);`
    );

    await expect(new ClaudeCliInference({ command }).complete(REQUEST)).rejects.toMatchObject({
      name: 'Refusal',
      status: 502,
      message: expect.stringContaining('Please run /login')
    });
  });

  test('output that is not the CLI’s answer is refused too', async () => {
    const command = fake('claude', `console.log('hello');`);

    await expect(new ClaudeCliInference({ command }).complete(REQUEST)).rejects.toMatchObject({
      status: 502
    });
  });

  test('a run past its time is stopped, and its directory removed', async () => {
    const command = fake('claude', 'setTimeout(() => {}, 10000);');

    await expect(
      new ClaudeCliInference({ command, timeout: 300 }).complete(REQUEST)
    ).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/time/) });
    expect(existsSync(invocation('claude').cwd)).toBe(false);
  });

  // The code review of #114: a run that ignored SIGTERM held complete() for ever, and its directory with it.
  test('a run that ignores being asked to stop is killed, and its directory still removed', async () => {
    const command = fake('claude', 'process.on("SIGTERM", () => {}); setTimeout(() => {}, 10000);');

    await expect(
      new ClaudeCliInference({ command, timeout: 1000, grace: 300 }).complete(REQUEST)
    ).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/time/) });
    expect(existsSync(invocation('claude').cwd)).toBe(false);
  });

  test('says how a run is charged before any run', () => {
    expect(new ClaudeCliInference().name).toBe('claude-cli');
    expect(new ClaudeCliInference().cost).toEqual({
      charged: expect.stringMatching(/signed in/),
      note: expect.stringMatching(/subscription/)
    });
  });
});

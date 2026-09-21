/**
 * @jest-environment node
 */
import { TailoringJob } from '../core/TailoringJob.js';
import { Refusal } from '../core/Refusal.js';

// A tailoring job, end to end (#260, #303): tailor, print in one layout, gate. A print the copy can fix goes back to
// the model, up to auditRetries times; a layout defect does not; and auditGate decides what a last failure means.
const FILES = { cv: 'out/cv.pdf', letter: 'out/letter.pdf' };
const TOO_LONG = {
  document: 'cv',
  check: 'pages',
  copy: true,
  reason: 'the CV printed 3 pages, and must fit 2: cut it until it does'
};
const LAYOUT = {
  document: 'cv',
  check: 'contrast',
  copy: false,
  reason: 'the CV fails contrast in audit:print'
};
const PASSED = { passed: true, printed: true, failures: [], notRun: [], files: FILES };
const failed = (...failures) => ({
  passed: false,
  printed: true,
  failures,
  notRun: [],
  files: FILES
});

const setup = ({ prints, options = {} }) => {
  const seeds = [];
  const updates = [];
  let round = 0;
  const tailor = {
    run: async (job, { update }, seed) => {
      seeds.push(seed);
      round += 1;
      await update({ attempts: 1 });
      return {
        tailored: 'applications/x/tailored.json',
        report: {},
        sources: {},
        questions: [],
        attempts: 1,
        cost: { backend: 'anthropic-api', usd: 0.5 },
        answer: { profile: { name: 'Ada Lovelace', round } }
      };
    }
  };
  const printed = [];
  const print = {
    run: async (job, profile) => {
      printed.push(profile);
      return prints.shift();
    }
  };
  const job = {
    id: 'x',
    directory: 'applications/x',
    options: { auditRetries: 2, auditGate: true, ...options }
  };
  const run = () =>
    new TailoringJob({ tailor, print }).run(job, {
      update: async (fields) => updates.push(fields)
    });
  return { seeds, updates, printed, run };
};

describe('a tailoring job', () => {
  test('that prints clean is ready, with its documents, its gate and what it cost', async () => {
    const { printed, run } = setup({ prints: [PASSED] });

    const result = await run();

    expect(printed).toEqual([{ name: 'Ada Lovelace', round: 1 }]);
    expect(result).toMatchObject({
      files: FILES,
      attempts: 1,
      cost: { usd: 0.5 },
      gate: { passed: true, failures: [], notRun: [], retries: 0 }
    });
    expect(result).not.toHaveProperty('answer');
  });

  test('a CV past its pages goes back to the model with what failed, and is printed again', async () => {
    const { seeds, updates, run } = setup({ prints: [failed(TOO_LONG), PASSED] });

    const result = await run();

    expect(seeds).toEqual([
      null,
      {
        kind: 'print',
        answer: { profile: { name: 'Ada Lovelace', round: 1 } },
        failures: [{ path: 'cv', reason: TOO_LONG.reason }]
      }
    ]);
    expect(updates).toEqual([{ attempts: 1 }, { attempts: 2 }]);
    expect(result).toMatchObject({
      attempts: 2,
      cost: { usd: 1 },
      gate: { passed: true, retries: 1 }
    });
  });

  test('a layout defect the copy cannot fix is not sent back, and uses no retry', async () => {
    const { seeds, run } = setup({ prints: [failed(LAYOUT)] });

    await expect(run()).rejects.toMatchObject({ status: 422 });
    expect(seeds).toEqual([null]);
  });

  test('with the gate on, a print still failing after its retries fails the job, with the results', async () => {
    const { seeds, run } = setup({
      prints: [failed(TOO_LONG), failed(TOO_LONG), failed(TOO_LONG)]
    });

    const refusal = await run().catch((error) => error);

    expect(seeds).toHaveLength(3);
    expect(refusal).toBeInstanceOf(Refusal);
    expect(refusal.message).toMatch(/failed its gate after 2 retries: the CV printed 3 pages/);
    expect(refusal.details).toEqual([{ path: 'cv', reason: TOO_LONG.reason }]);
    expect(refusal.cost).toMatchObject({ usd: 1.5 });
    expect(refusal.result).toMatchObject({ gate: { passed: false, retries: 2 } });
    expect(refusal.result).not.toHaveProperty('files');
  });

  test('auditRetries 0 makes one attempt', async () => {
    const { seeds, run } = setup({ prints: [failed(TOO_LONG)], options: { auditRetries: 0 } });

    await expect(run()).rejects.toMatchObject({ status: 422 });
    expect(seeds).toEqual([null]);
  });

  test('with the gate off, the last print is delivered, and its gate lists every failed check', async () => {
    const { run } = setup({
      prints: [failed(TOO_LONG, LAYOUT)],
      options: { auditGate: false, auditRetries: 0 }
    });

    const result = await run();

    expect(result).toMatchObject({
      files: FILES,
      gate: { passed: false, failures: [TOO_LONG, LAYOUT] }
    });
  });

  test('an audit that did not run is no pass: it fails the job with the gate on, and is reported with it off', async () => {
    const notRun = {
      passed: false,
      printed: true,
      failures: [],
      notRun: ['audit:print'],
      files: FILES
    };
    const on = setup({ prints: [notRun] });
    await expect(on.run()).rejects.toMatchObject({
      details: [{ path: 'audit:print', reason: 'did not run' }]
    });

    const off = setup({ prints: [{ ...notRun }], options: { auditGate: false } });
    expect((await off.run()).gate).toMatchObject({ passed: false, notRun: ['audit:print'] });
  });

  // The review of #320: with the gate off, a build that printed nothing ended ready, listing downloads that were not
  // there, and each answered 500.
  test('a build that printed nothing fails the job whatever the gate, with nothing to deliver', async () => {
    const nothing = {
      passed: false,
      printed: false,
      failures: [],
      notRun: ['build:pdf (nothing printed: no browser found)'],
      files: { cv: null, letter: null }
    };
    const off = setup({ prints: [nothing], options: { auditGate: false } });

    const refusal = await off.run().catch((error) => error);

    expect(refusal.status).toBe(422);
    expect(refusal.message).toMatch(/build:pdf \(nothing printed: no browser found\) did not run/);
    expect(refusal.result).not.toHaveProperty('files');
  });
});

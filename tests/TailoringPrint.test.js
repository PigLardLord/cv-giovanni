/**
 * @jest-environment node
 */
import { TailoringPrint } from '../core/TailoringPrint.js';

// A tailoring job prints its CV and letter in its one layout and gates the result (#260, #303). What the audits find
// is sorted by who can fix it: a document past its pages goes back to the copy; anything else is a layout defect the
// copy cannot fix. An audit that did not run is never a pass.
const PROFILE = { name: 'Ada Lovelace', letter: { subject: 'Senior iOS Engineer' } };
const JOB = {
  id: '20260921-143205-a1b2c3',
  directory: 'applications/20260921-143205-a1b2c3',
  options: { language: 'de', layout: 'technical' }
};
const OUT = `${JOB.directory}/out`;

const setup = ({ exits = {}, results } = {}) => {
  const stored = new Map();
  if (results !== undefined) stored.set(`${OUT}/PRINT_AUDIT.json`, JSON.stringify(results));
  const runs = [];
  const files = {
    stored,
    writeText: async (path, text) => stored.set(path, text),
    readText: async (path) => stored.get(path),
    exists: async (path) => stored.has(path)
  };
  const scripts = {
    run: async (name, args) => {
      runs.push([name, args]);
      return { exitCode: exits[name] ?? 0, stdout: '', stderr: '' };
    }
  };
  return { stored, runs, print: new TailoringPrint({ files, scripts }) };
};
const CLEAN = {
  cv: [{ layout: 'technical', pages: 2, failed: [] }],
  letters: [{ layout: 'technical', pages: 1, failed: [] }]
};

describe('the print of a tailoring', () => {
  test('writes the profile where a local profile lives, and prints and audits it in the job’s one layout', async () => {
    const { stored, runs, print } = setup({ results: CLEAN });

    const result = await print.run(JOB, PROFILE);

    expect(JSON.parse(stored.get(`${JOB.directory}/de.json`))).toEqual(PROFILE);
    const args = [`--profile=${JOB.directory}/de.json`, '--layout', 'technical'];
    expect(runs).toEqual([
      ['generate-pdfs', args],
      ['audit-print', args],
      ['audit-ats', args]
    ]);
    expect(result).toEqual({
      passed: true,
      failures: [],
      notRun: [],
      files: {
        cv: `${OUT}/ada-lovelace-20260921-143205-a1b2c3-de-technical.pdf`,
        letter: `${OUT}/ada-lovelace-20260921-143205-a1b2c3-de-technical-cover.pdf`
      }
    });
  });

  test('a document past its pages is the copy’s to fix', async () => {
    const { print } = setup({
      results: {
        cv: [{ layout: 'technical', pages: 3, failed: ['pages'] }],
        letters: [{ layout: 'technical', pages: 2, failed: ['pages'] }]
      },
      exits: { 'audit-print': 1 }
    });

    const { passed, failures } = await print.run(JOB, PROFILE);

    expect(passed).toBe(false);
    expect(failures).toEqual([
      expect.objectContaining({
        document: 'cv',
        check: 'pages',
        copy: true,
        reason: expect.stringMatching(/printed 3 pages, and must fit 2/)
      }),
      expect.objectContaining({
        document: 'letter',
        check: 'pages',
        copy: true,
        reason: expect.stringMatching(/printed 2 pages, and must fit 1/)
      })
    ]);
  });

  test('any other check, and an ATS floor, is a layout defect the copy cannot fix', async () => {
    const { print } = setup({
      results: { cv: [{ layout: 'technical', pages: 2, failed: ['contrast'] }], letters: [] },
      exits: { 'audit-print': 1, 'audit-ats': 1 }
    });

    const { failures } = await print.run(JOB, PROFILE);

    expect(failures.map(({ check, copy }) => [check, copy])).toEqual([
      ['contrast', false],
      ['audit:ats', false]
    ]);
  });

  test('an audit that did not run is not run, never a pass', async () => {
    const { print } = setup({ exits: { 'audit-print': 2, 'audit-ats': 2 } });

    expect(await print.run(JOB, PROFILE)).toMatchObject({
      passed: false,
      failures: [],
      notRun: ['audit:print', 'audit:ats']
    });
  });

  test('a build that failed says what it said last', async () => {
    const { print } = setup();
    print.scripts.run = async () => ({
      exitCode: 1,
      stdout: '',
      stderr:
        '  at x (file.mjs:1)\nError: Runtime.evaluate got no answer within 30s\n    at Timeout.<anonymous>\n'
    });

    expect((await print.run(JOB, PROFILE)).notRun).toEqual([
      'build:pdf (failed: Error: Runtime.evaluate got no answer within 30s)'
    ]);
  });

  test('a build that printed nothing stops before any audit', async () => {
    const { runs, print } = setup({ exits: { 'generate-pdfs': 2 } });

    expect(await print.run(JOB, PROFILE)).toMatchObject({
      passed: false,
      notRun: ['build:pdf (nothing printed)']
    });
    expect(runs.map(([name]) => name)).toEqual(['generate-pdfs']);
  });

  test('a letterless profile has no letter to deliver', async () => {
    const { print } = setup({ results: { cv: CLEAN.cv, letters: [] } });

    expect((await print.run(JOB, { name: 'Ada Lovelace' })).files.letter).toBeNull();
  });
});

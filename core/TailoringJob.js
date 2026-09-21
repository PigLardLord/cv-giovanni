import { Refusal } from './Refusal.js';

/**
 * What a tailoring job does, end to end (#260, #303): tailor the full CV to the advert and write its letter, print both
 * in the job's layout, and hold the print to the gate.
 *
 * The tailoring holds the answer to its source (`Tailor`); the print holds the documents to the audits
 * (`TailoringPrint`). A print the copy can fix — a CV past two pages, a letter past one — goes back to the model with
 * what failed, up to `auditRetries` times. A layout defect the copy cannot fix is not sent back: another attempt would
 * cost minutes at maximum effort and change nothing (#17). When the last print still fails, `auditGate` decides: on,
 * the job fails, with the results and nothing to download; off, it is ready, and its gate lists every failed check.
 * An audit that did not run is never a pass: with the gate on it fails the job, and off, the gate says so.
 */
export class TailoringJob {
  /**
   * @param {object} parts - What the job is made of
   * @param {{ run: Function }} parts.tailor - The tailoring, held to its source
   * @param {{ run: Function }} parts.print - The print, and its audits
   */
  constructor({ tailor, print }) {
    this.tailor = tailor;
    this.print = print;
  }

  /**
   * @param {{ id: string, directory: string, options: object }} job - The job, as `Tailorings` hands it
   * @param {{ update: Function }} progress - Records the attempts as they are made
   * @returns {Promise<object>} The tailoring's result, with the gate, the documents it printed, every attempt and the
   *   cost of all of them
   * @throws {Refusal} When the tailoring cannot hold to its source, or, with the gate on, when the print fails it
   */
  async run(job, { update }) {
    const { auditRetries = 2, auditGate = true } = job.options;
    let attempts = 0;
    let usd = null;
    let seed = null;
    let retries = 0;
    let tailored;
    let printed;
    const progress = {
      update: (fields) =>
        update(fields.attempts ? { ...fields, attempts: attempts + fields.attempts } : fields)
    };
    const spend = (cost) => {
      if (typeof cost?.usd === 'number') usd = Math.round(((usd ?? 0) + cost.usd) * 1e6) / 1e6;
    };

    for (;;) {
      try {
        tailored = await this.tailor.run(job, progress, seed);
      } catch (error) {
        if (error instanceof Refusal) {
          spend(error.cost);
          error.cost = { ...error.cost, usd };
        }
        throw error;
      }
      attempts += tailored.attempts;
      spend(tailored.cost);
      printed = await this.print.run(job, tailored.answer.profile);
      if (printed.passed) break;
      const copy = printed.failures.filter((failure) => failure.copy);
      if (!copy.length || retries >= auditRetries) break;
      retries += 1;
      seed = {
        answer: tailored.answer,
        failures: copy.map(({ document, reason }) => ({ path: document, reason }))
      };
    }

    const { answer, ...result } = tailored;
    const gate = {
      passed: printed.passed,
      failures: printed.failures,
      notRun: printed.notRun,
      retries
    };
    const outcome = { ...result, attempts, cost: { ...result.cost, usd }, gate };
    if (!printed.passed && auditGate) {
      const problems = [
        ...printed.failures.map(({ document, reason }) => ({ path: document, reason })),
        ...printed.notRun.map((audit) => ({ path: audit, reason: 'did not run' }))
      ];
      throw Object.assign(
        new Refusal(
          422,
          `The print failed its gate${retries ? ` after ${retries} ${retries === 1 ? 'retry' : 'retries'}` : ''}: ${problems[0].path} ${problems[0].reason}${problems.length > 1 ? `, and ${problems.length - 1} more` : ''}.`,
          problems
        ),
        { cost: outcome.cost, result: outcome }
      );
    }
    return { ...outcome, files: printed.files };
  }
}

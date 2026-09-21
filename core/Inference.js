import { Refusal } from './Refusal.js';

/**
 * The models a run may ask for, and the efforts, named once (#266). #260 runs a tailoring job with the model and the
 * effort it names; a value outside these is refused here, naming them, before any backend runs.
 */
export const MODELS = Object.freeze(['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1']);
export const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

/** The longest a timer waits before it overflows, in milliseconds: about 24.8 days. */
const LONGEST_WAIT = 2 ** 31 - 1;

/**
 * The model the local app asks for help, through whichever backend this machine has (#22).
 *
 * The backends are tried in the order given. The local claude CLI comes first: it runs on the subscription
 * this machine is already signed in to, at no cost per run. An API key comes second, paid per run. The first
 * backend available answers, and which one that is, with how it charges, is known before a run rather than
 * found on a bill after it. With none available, a run is refused, with the reason each backend gave.
 *
 * A backend is `{ name, cost, availability(), complete({ system, prompt, model?, effort?, deadline? }) }`. The
 * service never sees a credential: a backend that needs one reads it where it is kept, outside the repository.
 */
export class Inference {
  /** @param {object[]} backends - In order of preference */
  constructor(backends = []) {
    this.backends = backends;
  }

  /**
   * @returns {Promise<{ backend: string|null, cost: object|null, unavailable: { backend: string, reason: string }[] }>}
   *   The backend a run would use and how it charges, or none, and why each one before it was passed over
   */
  async status() {
    const unavailable = [];
    for (const backend of this.backends) {
      const { available, reason } = await backend.availability();
      if (available) return { backend: backend.name, cost: backend.cost, unavailable };
      unavailable.push({ backend: backend.name, reason });
    }
    return { backend: null, cost: null, unavailable };
  }

  /**
   * @param {{ system: string, prompt: string, model?: string, effort?: string, deadline?: number }} request - What
   *   the model is told and asked, and optionally which model, how hard it thinks, and by when it must have answered
   *   (milliseconds since the epoch). Whatever the run leaves out, the backend chooses.
   * @returns {Promise<{ backend: string, text: string, usd: number|null }>} The answer, who gave it, and its cost
   * @throws {Refusal} 422 for a request with nothing to ask or a value no backend takes, 503 when no backend is
   *   available
   */
  async complete(request) {
    const { system, prompt, model, effort, deadline } =
      request && typeof request === 'object' ? request : {};
    if (
      typeof system !== 'string' ||
      !system.trim() ||
      typeof prompt !== 'string' ||
      !prompt.trim()
    ) {
      throw new Refusal(422, 'A run needs a system prompt and a prompt.');
    }
    if (model !== undefined && !MODELS.includes(model)) {
      throw new Refusal(422, `A run's model is one of ${MODELS.join(', ')}; not ${model}.`);
    }
    if (effort !== undefined && !EFFORTS.includes(effort)) {
      throw new Refusal(422, `A run's effort is one of ${EFFORTS.join(', ')}; not ${effort}.`);
    }
    if (deadline !== undefined && !Number.isFinite(deadline)) {
      throw new Refusal(422, "A run's deadline is a time, in milliseconds since the epoch.");
    }
    // A timer longer than 2**31 - 1 ms overflows and fires after one: the longest window would give the shortest run.
    if (deadline !== undefined && deadline - Date.now() > LONGEST_WAIT) {
      throw new Refusal(422, "A run's deadline is at most 24 days ahead.");
    }
    const { backend, unavailable } = await this.status();
    if (!backend) {
      const reasons = unavailable.map((entry) => `${entry.backend}: ${entry.reason}`).join('; ');
      throw new Refusal(503, `No inference is available on this machine — ${reasons}.`);
    }
    const answer = await this.backends
      .find((candidate) => candidate.name === backend)
      .complete({
        system,
        prompt,
        ...(model !== undefined && { model }),
        ...(effort !== undefined && { effort }),
        ...(deadline !== undefined && { deadline })
      });
    return { backend, ...answer };
  }
}

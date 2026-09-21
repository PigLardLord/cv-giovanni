import { CvDocument } from '../domain/CvDocument.js';
import { AdvertMatcher } from './AdvertMatcher.js';
import { ProvenanceCheck } from './ProvenanceCheck.js';
import { Refusal } from './Refusal.js';

/** The system prompt, in the repository and sent byte for byte, so the API can cache it (#260). */
export const SYSTEM_PROMPT = 'prompts/tailor-cv.md';

/** A failed check goes back to the model at most this many times; the attempt after the last one is final. */
export const RETRIES = 2;

/** How long a whole job may run, every attempt included, in milliseconds. */
const TIME_LIMIT = 60 * 60 * 1000;

/** How many of the advert's terms the model is shown, and the check holds the tailoring to. */
const TERMS = 40;

/** The language the full CV is written in. Another is a translation, which is step 6 of #260. */
const SOURCE_LANGUAGE = 'en';

/**
 * A tailoring: the full CV and an advert in, a tailored profile that says nothing the full CV does not out (#260,
 * #284). The work a tailoring job does, handed to `Tailorings` as its `work` port.
 *
 * The model chooses, orders and rewords; `ProvenanceCheck` then holds every item of its answer to the item of the
 * full CV it names as its source. A failed check goes back to the model with what failed, at most twice, and a job
 * still failing after that ends failed with every failure. No field lifts the check: it is not an audit, and a
 * tailored CV that invented a figure is not a CV that may be sent with a warning.
 *
 * What the advert asks for and the full CV does not evidence becomes a question for the owner, never a line of the
 * CV: the answer belongs in the full CV, where it holds for every application after.
 */
export class Tailor {
  /**
   * @param {object} ports - What a tailoring reaches the machine through
   * @param {{ complete: Function }} ports.inference - The model
   * @param {{ readText: Function, writeText: Function }} ports.files - The project's files
   * @param {() => number} [ports.clock] - The time, in milliseconds since the epoch
   * @param {number} [ports.timeLimit] - How long a job may run, in milliseconds
   */
  constructor({ inference, files, clock = Date.now, timeLimit = TIME_LIMIT }) {
    this.inference = inference;
    this.files = files;
    this.clock = clock;
    this.timeLimit = timeLimit;
  }

  /** Where a job's tailored profile is written. */
  static tailoredPath(directory) {
    return `${directory}/tailored.json`;
  }

  /**
   * @param {{ directory: string, advert: string, options: object, cv: object }} job - The job, as `Tailorings` hands it
   * @param {{ update: Function }} progress - Records the attempts as they are made
   * @returns {Promise<object>} The tailored profile's file, the report, the sources, the questions, the attempts and
   *   the cost
   * @throws {Refusal} When the job cannot run, when the model or its backend refuses, or when the last attempt still
   *   fails the check — then with every failure as its details
   */
  async run(job, { update }) {
    const { directory, advert, options, cv: source } = job;
    if (options.language !== SOURCE_LANGUAGE) {
      throw new Refusal(
        501,
        `The full CV is written in ${SOURCE_LANGUAGE}; a tailoring into ${options.language} is step 6 of #260, and has not landed.`
      );
    }
    const deadline = this.clock() + this.timeLimit;
    const system = await this.files.readText(SYSTEM_PROMPT);
    const terms = Tailor.terms(advert, source);
    // What a tailoring must not bring in: every term the advert requires and the full CV does not evidence, in any
    // case it is written in, and the advert's names and technologies. The advert's words the CV never writes are held
    // by the check itself, from the advert.
    const vocabulary = terms
      .filter(
        ({ term, required, evidence }) =>
          (required && evidence === 'absent') || /\p{Lu}|\d|[+#/.]/u.test(term)
      )
      .map(({ term }) => term);

    let failures = [];
    let answer = null;
    const spent = [];
    for (let attempt = 1; attempt <= RETRIES + 1; attempt += 1) {
      await update({ attempts: attempt });
      let reply;
      try {
        reply = await this.inference.complete({
          system,
          prompt: Tailor.prompt({
            source,
            advert,
            terms,
            letter: options.letter,
            answer,
            failures
          }),
          model: options.model,
          effort: options.effort,
          deadline
        });
      } catch (error) {
        // A refusal ends the job at once; what the attempts before it, and a priced refusal, cost is still owed.
        if (error instanceof Refusal)
          error.cost = Tailor.cost([...spent, { usd: error.usd ?? null }]);
        throw error;
      }
      spent.push(reply);
      const read = Tailor.read(reply);
      answer = read.answer;
      failures = read.failures.length
        ? read.failures
        : ProvenanceCheck.failures({
            source,
            tailored: answer.profile,
            sources: answer.sources,
            terms: vocabulary,
            advert
          });
      if (!failures.length) {
        const tailored = Tailor.tailoredPath(directory);
        await this.files.writeText(tailored, `${JSON.stringify(answer.profile, null, 2)}\n`);
        return {
          tailored,
          report: answer.report,
          sources: answer.sources,
          questions: Tailor.questions(terms, answer.questions),
          attempts: attempt,
          cost: Tailor.cost(spent)
        };
      }
    }
    throw Object.assign(
      new Refusal(
        422,
        `The tailoring still said what its source does not after ${RETRIES + 1} attempts: ${failures[0].path} ${failures[0].reason}${failures.length > 1 ? `, and ${failures.length - 1} more` : ''}.`,
        failures
      ),
      { cost: Tailor.cost(spent) }
    );
  }

  /**
   * The advert's terms, each with where the full CV evidences it: in a role's prose, only in a list, or nowhere.
   * @returns {{ term: string, required: boolean, evidence: 'prose'|'listed'|'absent' }[]} The terms
   */
  static terms(advert, source) {
    const document = new CvDocument(source);
    const prose = [
      document.profile,
      ...document.careerHighlights,
      ...document.experience.flatMap((role) => [
        role.title,
        role.company,
        role.summary,
        role.description,
        ...(role.highlights || [])
      ])
    ]
      .filter(Boolean)
      .join('\n');
    const listed = AdvertMatcher.authoredText(document);
    return AdvertMatcher.extractTerms(advert, TERMS).terms.map(({ term, required }) => ({
      term,
      required,
      evidence: AdvertMatcher.appears(term, prose)
        ? 'prose'
        : AdvertMatcher.appears(term, listed)
          ? 'listed'
          : 'absent'
    }));
  }

  /** What the model is asked: the four things #260 names, and, on a retry, its last answer and what failed. */
  static prompt({ source, advert, terms, letter, answer, failures }) {
    const parts = [
      `<full_cv>\n${JSON.stringify(source, null, 2)}\n</full_cv>`,
      `<advert>\n${advert}\n</advert>`,
      `<advert_terms>\n${JSON.stringify(terms, null, 2)}\n</advert_terms>`,
      `<letter_defaults>\n${JSON.stringify(letter ?? {}, null, 2)}\n</letter_defaults>`
    ];
    if (failures.length) {
      parts.push(
        `<previous_answer>\n${answer ? JSON.stringify(answer, null, 2) : '(none that could be read)'}\n</previous_answer>`,
        `<what_failed>\n${failures.map(({ path, reason }) => `- ${path}: ${reason}`).join('\n')}\n</what_failed>`,
        'Your previous answer failed the check against the full CV. Correct every failure above — by using what the ' +
          'source item states, or by leaving the claim out and asking about it in `questions` — and answer again ' +
          'with the whole JSON object.'
      );
    } else {
      parts.push('Tailor the full CV to the advert, and answer with the JSON object.');
    }
    return parts.join('\n\n');
  }

  /**
   * The model's answer, read: the JSON object, or the failures that stop it being checked.
   * @returns {{ answer: object|null, failures: { path: string, reason: string }[] }} What was read
   */
  static read({ text, truncated }) {
    const fail = (reason) => ({ answer: null, failures: [{ path: 'answer', reason }] });
    if (truncated) return fail('was cut off at the output limit: answer with a shorter CV');
    const body = String(text ?? '').trim();
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end < start) return fail('is not a JSON object');
    let answer;
    try {
      answer = JSON.parse(body.slice(start, end + 1));
    } catch {
      return fail('is not valid JSON');
    }
    if (!answer || typeof answer !== 'object' || Array.isArray(answer))
      return fail('is not a JSON object');
    if (!answer.profile || typeof answer.profile !== 'object' || Array.isArray(answer.profile)) {
      return fail('has no `profile` object');
    }
    const isObject = (value) =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    if (answer.sources !== undefined && !isObject(answer.sources)) {
      return fail('has `sources` that is not an object from each tailored item to its source');
    }
    const { letter, ...profile } = answer.profile;
    return {
      answer: {
        profile,
        sources: answer.sources ?? {},
        report: isObject(answer.report) ? answer.report : {},
        questions: Array.isArray(answer.questions)
          ? answer.questions.filter((question) => typeof question === 'string' && question.trim())
          : []
      },
      failures: []
    };
  }

  /**
   * The questions for the owner: every term the advert requires that the full CV does not evidence, then what the
   * model says it would have needed.
   */
  static questions(terms, asked = []) {
    return [
      ...terms
        .filter(({ required, evidence }) => required && evidence === 'absent')
        .map(({ term }) => ({
          from: 'advert',
          term,
          question: `The advert requires "${term}", and the full CV does not mention it. If it is true, where and how did you use it?`
        })),
      ...asked.map((question) => ({ from: 'model', question }))
    ];
  }

  /** What the attempts cost, summed: null when no backend said. */
  static cost(replies) {
    const priced = replies.map(({ usd }) => usd).filter((usd) => typeof usd === 'number');
    return {
      backend: replies.findLast((reply) => reply.backend)?.backend ?? null,
      usd: priced.length ? Math.round(priced.reduce((sum, usd) => sum + usd, 0) * 1e6) / 1e6 : null
    };
  }
}

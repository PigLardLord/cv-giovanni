/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { Tailor, SYSTEM_PROMPT, RETRIES } from '../core/Tailor.js';
import { Tailorings, DEFAULTS } from '../core/Tailorings.js';
import { Refusal } from '../core/Refusal.js';

// The work a tailoring job does (#284): the model tailors the full CV to the advert, the answer is checked against
// the full CV, and a failed check goes back with what failed, at most twice, before the job ends failed.
const SOURCE = Object.freeze({
  name: 'Ada Lovelace',
  title: 'Senior iOS Engineer',
  email: 'ada@example.com',
  profile: 'Senior iOS engineer with 11+ years in native mobile development.',
  relevant_experience: [
    {
      title: 'iOS Developer',
      company: 'Analytical Engines',
      period: 'January 2021 – December 2023',
      highlights: [
        'Engine Notes for iOS, built in SwiftUI from 2021.',
        'Cut the test suite from 37.7 to 5.2 minutes.'
      ]
    }
  ],
  skills: [{ category: 'iOS', items: [{ name: 'Swift' }, { name: 'SwiftUI' }] }]
});
const ADVERT = [
  'Senior iOS Engineer at Engine Works',
  '',
  'Requirements:',
  '- SwiftUI in production',
  '- Kotlin Multiplatform',
  '- Test automation'
].join('\n');
const PROMPT = 'You tailor a CV. (the prompt, as the repository holds it)\n';

/** An answer the check passes: the source, cut to its first achievement. */
const faithful = () => {
  const profile = structuredClone(SOURCE);
  profile.relevant_experience[0].highlights = ['Cut the test suite from 37.7 to 5.2 minutes.'];
  profile.letter = {
    recipient: { company: 'Engine Works' },
    subject: 'Senior iOS Engineer',
    opening: 'I am writing about the Senior iOS Engineer role.',
    body: ['At Analytical Engines I cut the test suite from 37.7 to 5.2 minutes.'],
    closing: 'I look forward to hearing from you.'
  };
  return {
    profile,
    sources: {
      'relevant_experience[0]': 'relevant_experience[0]',
      'relevant_experience[0].highlights[0]': 'relevant_experience[0].highlights[1]'
    },
    report: { argument: 'A senior iOS engineer who speeds up delivery.', cut: ['Engine Notes'] },
    questions: ['How many releases a year did the faster suite allow?']
  };
};
/** The same, with an achievement that invents a figure and a technology. */
const inventive = () => {
  const answer = faithful();
  answer.profile.relevant_experience[0].highlights = [
    'Cut the test suite from 37.7 to 2 minutes with Kotlin Multiplatform.'
  ];
  return answer;
};

const reply = (answer, usd = 0.5) => ({
  backend: 'anthropic-api',
  text: typeof answer === 'string' ? answer : JSON.stringify(answer),
  usd,
  truncated: false
});

const setup = (
  replies,
  { language = 'en', advert = ADVERT, clock, letter = { note: 'Remote.' } } = {}
) => {
  const asked = [];
  const written = new Map();
  const inference = {
    complete: async (request) => {
      asked.push(request);
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next;
    }
  };
  const files = {
    readText: async (path) => {
      if (path === SYSTEM_PROMPT) return PROMPT;
      throw new Error(`no ${path}`);
    },
    writeText: async (path, text) => written.set(path, text)
  };
  const updates = [];
  const tailor = new Tailor({
    inference,
    files,
    clock: clock ?? (() => 1_000_000),
    timeLimit: 60_000
  });
  const job = {
    id: '20260921-143205-a1b2c3',
    directory: 'applications/20260921-143205-a1b2c3',
    advert,
    options: { ...DEFAULTS, language, letter },
    cv: SOURCE
  };
  const run = () => tailor.run(job, { update: async (fields) => updates.push(fields) });
  return { asked, written, updates, run };
};

describe('a tailoring the check passes', () => {
  test('is written, with its report, its sources, the questions, one attempt and its cost', async () => {
    const { written, updates, run } = setup([reply(faithful(), 0.42)]);

    const result = await run();

    expect(result).toEqual({
      tailored: 'applications/20260921-143205-a1b2c3/tailored.json',
      report: { ...faithful().report, language: 'en', translated: false },
      sources: faithful().sources,
      questions: expect.any(Array),
      attempts: 1,
      cost: { backend: 'anthropic-api', usd: 0.42 }
    });
    // Every required term the full CV does not evidence, then what the model says it would have needed.
    expect(result.questions).toContainEqual(
      expect.objectContaining({ from: 'advert', term: expect.stringMatching(/Kotlin/) })
    );
    expect(result.questions.at(-1)).toEqual({
      from: 'model',
      question: 'How many releases a year did the faster suite allow?'
    });
    const { letter, ...profile } = faithful().profile;
    expect(JSON.parse(written.get(result.tailored))).toEqual({
      ...profile,
      // The job dates and signs the letter; the model does neither (#299).
      letter: { ...letter, date: '1970-01-01', signature: 'Ada Lovelace' }
    });
    expect(updates).toEqual([{ attempts: 1 }]);
  });

  test('the model is asked with the repository’s prompt, byte for byte, the job’s model and effort, and one deadline', async () => {
    const { asked, run } = setup([reply(faithful())]);

    await run();

    expect(asked).toEqual([
      expect.objectContaining({
        system: PROMPT,
        model: 'claude-opus-5',
        effort: 'max',
        deadline: 1_000_000 + 60_000
      })
    ]);
  });

  test('and given the four things #260 names: the full CV, the advert, its terms with their evidence, the letter’s defaults', async () => {
    const { asked, run } = setup([reply(faithful())]);

    await run();

    const { prompt } = asked[0];
    expect(prompt).toContain(`<full_cv>\n${JSON.stringify(SOURCE, null, 2)}\n</full_cv>`);
    expect(prompt).toContain(`<advert>\n${ADVERT}\n</advert>`);
    expect(prompt).toContain('<letter_defaults>\n{\n  "note": "Remote."\n}\n</letter_defaults>');
    const terms = JSON.parse(/<advert_terms>\n([\s\S]*?)\n<\/advert_terms>/.exec(prompt)[1]);
    expect(terms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ term: 'SwiftUI', required: true, evidence: 'prose' }),
        expect.objectContaining({ term: expect.stringMatching(/Kotlin/), evidence: 'absent' })
      ])
    );
  });

  test('a letter the model dates or signs is dated and signed by the job', async () => {
    const answer = faithful();
    answer.profile.letter = { ...answer.profile.letter, date: '2020-01-01', signature: 'Someone' };
    const { written, run } = setup([reply(answer)], { clock: () => Date.UTC(2026, 8, 21, 14) });

    const { tailored } = await run();

    expect(JSON.parse(written.get(tailored)).letter).toMatchObject({
      date: '2026-09-21',
      signature: 'Ada Lovelace'
    });
  });

  test('an answer with no letter is a failure, and goes back', async () => {
    const bare = faithful();
    delete bare.profile.letter;
    const { asked, run } = setup([reply(bare), reply(faithful())]);

    await expect(run()).resolves.toMatchObject({ attempts: 2 });
    expect(asked[1].prompt).toMatch(/- letter: is missing/);
  });
});

describe('a tailoring the check refuses', () => {
  test('goes back with what failed, and is written once corrected', async () => {
    const { asked, updates, run } = setup([reply(inventive(), 0.5), reply(faithful(), 0.25)]);

    const result = await run();

    expect(result).toMatchObject({ attempts: 2, cost: { usd: 0.75 } });
    expect(updates).toEqual([{ attempts: 1 }, { attempts: 2 }]);
    const retry = asked[1].prompt;
    expect(retry).toContain('<previous_answer>');
    expect(retry).toContain('Cut the test suite from 37.7 to 2 minutes with Kotlin Multiplatform.');
    expect(retry).toMatch(
      /<what_failed>\n- relevant_experience\[0\]\.highlights\[0\]: states 2, which its source does not\n/
    );
    expect(retry).toContain('names "Kotlin", which its source does not');
  });

  test(`still failing after ${RETRIES} retries, ends the job failed with every failure and nothing written`, async () => {
    const { asked, written, run } = setup([
      reply(inventive(), 0.5),
      reply(inventive(), 0.5),
      reply(inventive(), 0.5)
    ]);

    const refusal = await run().catch((error) => error);

    expect(asked).toHaveLength(RETRIES + 1);
    expect(refusal).toBeInstanceOf(Refusal);
    expect(refusal.message).toMatch(
      /after 3 attempts: relevant_experience\[0\]\.highlights\[0\] states 2/
    );
    expect(refusal.details).toEqual(
      expect.arrayContaining([
        {
          path: 'relevant_experience[0].highlights[0]',
          reason: 'states 2, which its source does not'
        }
      ])
    );
    expect(refusal.cost).toEqual({ backend: 'anthropic-api', usd: 1.5 });
    expect(written.size).toBe(0);
  });

  test.each([
    ['prose', 'Here is the CV you asked for.', /is not a JSON object/],
    ['broken JSON', '{ "profile": ', /is not a JSON object|is not valid JSON/],
    ['no profile', '{ "sources": {} }', /has no `profile` object/]
  ])('an answer that is %s is a failure, and goes back', async (_, text, reason) => {
    const { asked, run } = setup([reply(text), reply(faithful())]);

    await expect(run()).resolves.toMatchObject({ attempts: 2 });
    expect(asked[1].prompt).toMatch(reason);
  });

  test('an answer cut off at the output limit is a failure, and goes back', async () => {
    const { asked, run } = setup([{ ...reply(faithful()), truncated: true }, reply(faithful())]);

    await expect(run()).resolves.toMatchObject({ attempts: 2 });
    expect(asked[1].prompt).toMatch(/cut off at the output limit/);
  });

  test('an advert term the full CV lacks, written into the CV, fails; left out, it is a question', async () => {
    const { run } = setup([reply(inventive()), reply(faithful())]);

    const { questions } = await run();

    expect(
      questions.filter(({ from }) => from === 'advert').map(({ term }) => term)
    ).toContainEqual(expect.stringMatching(/Kotlin/));
    expect(questions.map(({ term }) => term)).not.toContain('SwiftUI');
  });
});

// What the review of #286 found. A required term the advert writes in lower case was not held, and came back as a
// question while it stood in the CV.
describe('what the review of the tailoring found', () => {
  const LOWER = [
    'Senior iOS Engineer at Engine Works',
    '',
    'Requirements:',
    '- kotlin multiplatform',
    '- SwiftUI'
  ].join('\n');

  test('a required term in lower case, written into the CV, fails; left out, it is a question', async () => {
    const lower = faithful();
    lower.profile.relevant_experience[0].highlights = [
      'Cut the test suite from 37.7 to 5.2 minutes with kotlin multiplatform.'
    ];
    const { asked, run } = setup([reply(lower), reply(faithful())], { advert: LOWER });

    const { questions } = await run();

    expect(asked[1].prompt).toMatch(/says "kotlin[^"]*", which its source does not/);
    expect(questions.map(({ term }) => term)).toContainEqual(expect.stringMatching(/kotlin/));
  });

  test('a term the advert does not require is no question', async () => {
    const nice = ['Senior iOS Engineer at Engine Works', '', 'Nice to have:', '- Flutter'].join(
      '\n'
    );
    const { run } = setup([reply(faithful())], { advert: nice });

    const { questions } = await run();

    expect(questions.filter(({ from }) => from === 'advert')).toEqual([]);
  });

  test('a salary or a start the advert asks the letter for, and nothing gave, is a question', async () => {
    const asking = [
      'Senior iOS Engineer at Engine Works',
      '',
      'Please send your CV with your salary expectations and your earliest start date.'
    ].join('\n');
    const { run } = setup([reply(faithful())], { advert: asking });

    const { questions } = await run();

    expect(questions.filter(({ from }) => from === 'letter').map(({ field }) => field)).toEqual([
      'salaryExpectation',
      'startDate'
    ]);
  });

  test('one the defaults gave is no question', async () => {
    const asking = 'Senior iOS Engineer at Engine Works\n\nWith your Gehaltsvorstellung, please.';
    const { run } = setup([reply(faithful())], {
      advert: asking,
      letter: { salaryExpectation: '€85,000' }
    });

    const { questions } = await run();

    expect(questions.filter(({ from }) => from === 'letter')).toEqual([]);
  });

  test('the deadline is the job’s, set once, not one per attempt', async () => {
    let now = 1_000_000;
    const { asked, run } = setup([reply(inventive()), reply(faithful())], {
      clock: () => (now += 5_000)
    });

    await run();

    expect(asked.map(({ deadline }) => deadline)).toEqual([1_005_000 + 60_000, 1_005_000 + 60_000]);
  });

  test('sources that are not an object are one failure, and go back', async () => {
    const listed = { ...faithful(), sources: ['relevant_experience[0]'] };
    const { asked, run } = setup([reply(listed), reply(faithful())]);

    await run();

    expect(asked[1].prompt).toMatch(
      /<what_failed>\n- answer: has `sources` that is not an object from each tailored item to its source\n<\/what_failed>/
    );
  });
});

describe('a tailoring that cannot run', () => {
  test('a refusal of the model ends the job at once, with what the attempts cost', async () => {
    const declined = Object.assign(
      new Refusal(422, 'The model declined the run (cyber): no reason.'),
      {
        usd: 0.1
      }
    );
    const { asked, run } = setup([reply(inventive(), 0.5), declined]);

    const refusal = await run().catch((error) => error);

    expect(asked).toHaveLength(2);
    expect(refusal).toBe(declined);
    expect(refusal.cost).toEqual({ backend: 'anthropic-api', usd: 0.6 });
  });

  // The job's language and the letter's defaults reach the check: a German answer, its period in German months and
  // its letter stating the salary the defaults give, holds only if both do (the review of #300).
  test('a German answer is checked as a translation, and its letter against the defaults it was given', async () => {
    const german = faithful();
    german.profile.relevant_experience[0].period = 'Januar 2021 – Dezember 2023';
    german.profile.relevant_experience[0].highlights = [
      'Testlaufzeit von 37,7 auf 5,2 Minuten gesenkt.'
    ];
    german.profile.letter.body = ['Meine Gehaltsvorstellung liegt bei 85.000 € im Jahr.'];
    const { run } = setup([reply(german)], {
      language: 'de',
      letter: { salaryExpectation: '€85,000 a year' }
    });

    await expect(run()).resolves.toMatchObject({ attempts: 1, report: { translated: true } });
  });

  test('a job in another language is asked in it, and its report says it translated', async () => {
    const { asked, run } = setup([reply(faithful())], { language: 'de' });

    const { report } = await run();

    expect(asked[0].prompt).toContain(
      "<language>\nde — German, translated from the full CV's English\n</language>"
    );
    expect(report).toMatchObject({ language: 'de', translated: true });
  });
});

// Through the queue: the job ends ready with the result, or failed with every failure and the cost.
describe('a tailoring job', () => {
  const PUBLISHED = `${JSON.stringify(SOURCE, null, 2)}\n`;
  const project = () => {
    const stored = new Map(
      Object.entries({
        'config/cv-manifest.json': JSON.stringify({ layouts: ['technical'] }),
        'profiles/general/en.json': PUBLISHED,
        'locales/en/cv.json': '{}',
        [SYSTEM_PROMPT]: PROMPT
      })
    );
    return {
      stored,
      readText: async (path) => {
        if (!stored.has(path)) throw new Error(`no ${path}`);
        return stored.get(path);
      },
      writeText: async (path, text) => stored.set(path, text),
      exists: async (path) =>
        [...stored.keys()].some((key) => key === path || key.startsWith(`${path}/`)),
      list: async (path) => [
        ...new Set(
          [...stored.keys()]
            .filter((key) => key.startsWith(`${path}/`))
            .map((key) => key.slice(path.length + 1).split('/')[0])
        )
      ]
    };
  };
  const queue = (replies) => {
    const files = project();
    const inference = {
      status: async () => ({ backend: 'anthropic-api', cost: {}, unavailable: [] }),
      complete: async () => replies.shift()
    };
    const tailor = new Tailor({ inference, files });
    return {
      files,
      tailorings: new Tailorings({
        files,
        inference,
        work: (job, progress) => tailor.run(job, progress)
      })
    };
  };

  test('ends ready, with the tailored profile beside the job and the result in its state', async () => {
    const { files, tailorings } = queue([reply(faithful(), 0.42)]);

    const { id } = await tailorings.create({ advert: ADVERT });
    await tailorings.idle();

    expect(await tailorings.status(id)).toMatchObject({
      status: 'ready',
      attempts: 1,
      result: { tailored: `applications/${id}/tailored.json`, attempts: 1, cost: { usd: 0.42 } }
    });
    expect(files.stored.has(`applications/${id}/tailored.json`)).toBe(true);
  });

  test('ends failed, with every failure and what the attempts cost, and no tailored profile', async () => {
    const { files, tailorings } = queue([
      reply(inventive()),
      reply(inventive()),
      reply(inventive())
    ]);

    const { id } = await tailorings.create({ advert: ADVERT });
    await tailorings.idle();

    expect(await tailorings.status(id)).toMatchObject({
      status: 'failed',
      attempts: 3,
      reason: expect.stringMatching(/after 3 attempts/),
      problems: expect.arrayContaining([
        expect.objectContaining({ reason: 'states 2, which its source does not' })
      ]),
      cost: { usd: 1.5 }
    });
    expect(files.stored.has(`applications/${id}/tailored.json`)).toBe(false);
  });
});

describe('the system prompt', () => {
  const prompt = readFileSync(new URL(`../${SYSTEM_PROMPT}`, import.meta.url), 'utf8');

  test('is a file in the repository, which says the rule the check enforces', () => {
    expect(prompt).toMatch(/says nothing the full CV does not say/);
    expect(prompt).toMatch(/leave it out and ask/);
  });

  test('names no employer of the candidate: it is the same prompt for every CV', () => {
    const cv = JSON.parse(
      readFileSync(new URL('../profiles/general/en.json', import.meta.url), 'utf8')
    );
    for (const role of cv.relevant_experience) expect(prompt).not.toContain(role.company);
  });
});

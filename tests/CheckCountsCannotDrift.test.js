/**
 * @jest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Three documents stated how many checks the print audit runs, and all three were wrong: the stack profile
// said "seventeen checks … 17/17", AGENTS.md spoke of "an eighteenth check", and the audit scored 26/26.
// A number that drifts is worse than no number — a reader who counts the prose and compares it with the
// score concludes one of them is broken (#252). So no document states one, and the report derives its own.
// A count written as a number, an ordinal, or a score. Small ordinals in words are ordinary English — "the first
// check" counts nothing — so the words start at "tenth"; an ordinal in digits always reads as a count. Bare
// "one" is left out, so "no one checks" is not a count, and a score is caught only beside the verbs that restate
// one ("stays at", "scores"), so the ATS audit's "Recoverability 80/80", a different number, is not.
const CARDINAL =
  '(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|' +
  'seventeen|eighteen|nineteen|twenty(-[a-z]+)?|\\d+)';
const ORDINAL =
  '(tenth|eleventh|twelfth|(thir|four|fif|six|seven|eigh|nine)teenth|twentieth|twenty-[a-z]+|' +
  '\\d+(st|nd|rd|th))';
const COUNT = new RegExp(
  [
    `\\b${CARDINAL} checks\\b`,
    `\\b${ORDINAL} check\\b`,
    '\\b(stays?|remains?|held|scores?|scored)( at)? \\d+/\\d+',
    '\\b\\d+ of \\d+ checks?\\b'
  ].join('|'),
  'i'
);

/** The documents a reader goes to for how the project works. */
const DOCUMENTS = [
  'AGENTS.md',
  'README.md',
  'CLAUDE.md',
  ...readdirSync(new URL('../.agents/harness/stacks/', import.meta.url))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `.agents/harness/stacks/${name}`),
  // The role cards: the product reviewer's still said "seventeen checks" after the three above were fixed.
  ...readdirSync(new URL('../.claude/agents/', import.meta.url))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `.claude/agents/${name}`)
];

/**
 * The keys of every `const checks = { … }` literal in a script, in order, one list per literal.
 *
 * Read by counting brackets, not by parsing, so it assumes what Prettier and the script already hold to: one
 * identifier key per line, and no unbalanced bracket inside a comment, a string or a regex within the literal. A
 * "(" in a check's comment cuts the list short, and the test then fails on a list that looks truncated — look
 * there first. It cannot fail the other way: the report's list is `Object.keys` at runtime, so the two agree
 * only when this read is right.
 */
const checkKeys = (source) => {
  const lists = [];
  for (const start of source.matchAll(/const checks = \{\n/g)) {
    const keys = [];
    let depth = 1;
    for (const line of source.slice(start.index + start[0].length).split('\n')) {
      if (depth === 1) {
        const key = /^\s+([A-Za-z][A-Za-z0-9]*):/.exec(line);
        if (key) keys.push(key[1]);
      }
      depth += (line.match(/[{([]/g) ?? []).length - (line.match(/[})\]]/g) ?? []).length;
      if (depth <= 0) break;
    }
    lists.push(keys);
  }
  return lists;
};

describe('no document states a check count a build can contradict', () => {
  // The pattern has to be able to fail: the three shapes that drifted, and the ones the next edit is likeliest
  // to write. And it has to let ordinary prose through, or the first honest sentence turns the build red.
  test.each([
    'scores the printed PDFs on seventeen checks',
    'All three layouts must stay at 17/17.',
    'an eighteenth check there outlives any number of review comments',
    'All three layouts score 26/26.',
    'it passes 26 of 26 checks',
    'twenty-six checks on the CV',
    'a 27th check'
  ])('a stated count is recognised: %s', (text) => {
    expect(COUNT.test(text)).toBe(true);
  });

  test.each([
    'two artefacts and three audits',
    'every check it runs',
    'run the build and check the report',
    'no one checks it by hand',
    'the first check in the list',
    'Recoverability 80/80',
    '9 of 15 tickets'
  ])('ordinary prose is not: %s', (text) => {
    expect(COUNT.test(text)).toBe(false);
  });

  test.each(DOCUMENTS)('%s states none', (path) => {
    const stated = read(path)
      .split('\n')
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter(({ text }) => COUNT.test(text));
    expect(stated).toEqual([]);
  });
});

describe('the print report names every check it scores', () => {
  const [cv] = checkKeys(read('scripts/audit-print.mjs'));

  test('the checks are read from the script, so a new one is found without editing this file', () => {
    expect(cv).toContain('format');
    expect(cv).toContain('noPrivateUseGlyphs');
  });

  // The score is `passed/Object.keys(checks).length`, so it can never miscount. The prose above it can, and
  // did: 25 checks described under a 26/26 score. So the report ends its description with the list the
  // score counts, derived the same way, and the committed report has to carry every one of them.
  test('docs/PRINT_AUDIT.md lists every check the CV is scored on', () => {
    const listed = /^The checks the score counts: (.+)\.$/m.exec(read('docs/PRINT_AUDIT.md'));
    expect(listed).not.toBeNull();
    expect(listed[1].split(', ')).toEqual(cv);
  });
});

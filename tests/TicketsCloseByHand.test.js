/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  closingReferences,
  CLOSING_KEYWORDS,
  NON_CLOSING_PREFIX
} from '../scripts/lib/closing-keyword.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const manifest = JSON.parse(
  readFileSync(new URL('../.agents/harness/ticket-loop.json', import.meta.url))
);

/**
 * The six commits that carried `Closes #15`–`Closes #20` onto `cv-2026-update` before this rule
 * existed. They are merged already, through pull request #31, so rewriting them would orphan the
 * SHAs that pull request points at — a worse trade than naming the debt.
 *
 * They will close their tickets when `cv-2026-update` reaches `main`. Issue #37 says so, and
 * whoever merges is expected to reopen them for the auditor. Once they are on the base branch
 * they leave the range this check inspects and these lines can be deleted.
 */
const MERGED_BEFORE_THE_RULE = [
  '19b19f33fa34b93c08e466803a3229eb3a95b2de', // feat: a lexicon for job adverts — Closes #15
  'a9f42df263647b88ab84841a83c12591d8e68d6b', // feat: extract what an advert asks for — Closes #16
  '8ab9a9a92e91dd4d0913ce2ce7dc5fbf741ac733', // feat: separate a layout defect from a gap — Closes #17
  'ae1b00f470f23812401f26387149f19aa276f7a7', // feat: model a cover letter — Closes #18
  'e5ea8e381368910b24659776bb4e385d4f92c9eb', // feat: lay out a cover letter on DIN 5008 — Closes #19
  '8cef3927dfa8bfafa42e80d0da219054239910fd' // feat: generate the letter with the CV — Closes #20
];

describe('the rule about closing keywords', () => {
  // The check has to be able to fail, and this is where that is proved: a message with the
  // keyword is caught, the same message with `Refs` is not. Without this pair, a predicate that
  // returned nothing at all would pass the repository check below on any history.
  test.each(CLOSING_KEYWORDS)('`%s #19` closes a ticket', (keyword) => {
    expect(closingReferences(`feat: something\n\n${keyword} #19`)).toEqual([
      { keyword, issue: 19 }
    ]);
  });

  test(`\`${NON_CLOSING_PREFIX} #19\` does not`, () => {
    expect(closingReferences(`feat: something\n\n${NON_CLOSING_PREFIX} #19`)).toEqual([]);
  });

  test('a bare number and a hash inside a word are not references', () => {
    expect(closingReferences('feat: bump to 19\n\nSee ab#19')).toEqual([]);
  });
});

describe('a ticket is closed by a person, not by a merge', () => {
  // `board.never_autoclose` is the setting this check exists to keep honest. Reading it here
  // rather than assuming it means the two cannot drift: turn the flag off and the check stops
  // applying, which is a decision someone made in the manifest and can be seen there.
  test('the board still says a merge must not close a ticket', () => {
    expect(manifest.board.never_autoclose).toBe(true);
  });

  // Full SHAs, and no duplicates. Existence is deliberately not asserted: the objects are only
  // guaranteed present in a clone that fetched `cv-2026-update`, and a wrong SHA here cannot hide
  // a violation — it exempts nothing, and the check below goes red naming the commit.
  test('the exemptions are full SHAs, listed once each', () => {
    const malformed = MERGED_BEFORE_THE_RULE.filter((sha) => !/^[0-9a-f]{40}$/.test(sha));

    expect(malformed).toEqual([]);
    expect(new Set(MERGED_BEFORE_THE_RULE).size).toBe(MERGED_BEFORE_THE_RULE.length);
  });

  // The commits this branch would add to the base. On the base branch itself that set is empty
  // and the check passes trivially; on a branch about to be merged it is exactly the history a
  // merge would push to the default branch, which is when GitHub acts on the keywords.
  test('no commit this branch adds closes a ticket', () => {
    const base = manifest.vcs.base_branch;
    // An audit that could not run must never read as a pass — the mistake audit-print made for
    // weeks. If neither ref resolves, say so instead of reporting green.
    // The remote's base branch first: it is what a merge actually targets, and a local `main`
    // left behind by a fetch-less week would put commits already on the default branch back into
    // the range and fail on history nobody is about to push.
    const ref = [`origin/${base}`, base].find((candidate) => {
      try {
        git('rev-parse', '--verify', '--quiet', `${candidate}^{commit}`);
        return true;
      } catch {
        return false;
      }
    });
    expect(ref).toBeDefined();

    const offenders = git('log', '--format=%H', `${ref}..HEAD`)
      .split('\n')
      .filter(Boolean)
      .filter((sha) => !MERGED_BEFORE_THE_RULE.includes(sha))
      .flatMap((sha) =>
        closingReferences(git('log', '-1', '--format=%B', sha)).map(
          ({ keyword, issue }) => `${sha.slice(0, 7)} ${keyword} #${issue}`
        )
      );

    expect(offenders).toEqual([]);
  });
});

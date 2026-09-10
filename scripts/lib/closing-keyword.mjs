/**
 * The GitHub keywords that close an issue, and the rule this project applies to them.
 *
 * `board.never_autoclose` in `.agents/harness/ticket-loop.json` says a ticket is closed by a
 * person, after the work has been audited — never by a merge. A commit message ending
 * `Closes #19` overrides that silently: the issue closes the moment the commit reaches the
 * default branch, whatever the board says, and nobody reads a closed ticket.
 *
 * This module is the rule on its own, with no git in it, so the check that enforces it can be
 * shown to fail on a message that breaks it and pass on one that does not.
 */

/**
 * The full set GitHub honours, all three tenses of each verb. Anything outside it — `Refs`,
 * `Part of`, a bare `#19` — references the ticket without touching its state, which is what
 * this project wants a commit to do.
 *
 * @see https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue
 */
export const CLOSING_KEYWORDS = [
  'close', 'closes', 'closed',
  'fix', 'fixes', 'fixed',
  'resolve', 'resolves', 'resolved'
];

/**
 * The reference GitHub acts on: a keyword, whitespace, then `#<number>` or the issue's URL.
 * Case-insensitive, because GitHub is. A hash inside a word (`ab#12`) is not a reference, hence
 * the boundary before it.
 */
const REFERENCE = new RegExp(
  `\\b(${CLOSING_KEYWORDS.join('|')})\\b[\\s:]+` +
  '(?:https?://\\S*?/issues/(\\d+)|#(\\d+))',
  'gi'
);

/**
 * Every closing reference in one commit message or pull-request body.
 *
 * @param {string} message
 * @returns {Array<{keyword: string, issue: number}>} in the order they appear; empty when the
 *   message names tickets without claiming to close them.
 */
export function closingReferences(message = '') {
  return [...String(message).matchAll(REFERENCE)].map((match) => ({
    keyword: match[1],
    issue: Number(match[2] ?? match[3])
  }));
}

/** The phrasing to use instead. Named here so the failure message can suggest it. */
export const NON_CLOSING_PREFIX = 'Refs';

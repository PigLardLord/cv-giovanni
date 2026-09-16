/**
 * The rules of `npm run audit:ats:base` (#181), with no git, no browser and no file in them, so each can be shown to
 * fail.
 *
 * `audit:ats` grades the print with this repository's parser. A change to both the CV and that parser is graded by the
 * parser it changed, and can pass because the grader moved: pull request #179 first added " · 60 ECTS" after the Pisa
 * school line and widened the parser to read it, and "Recoverability 80/80" held while the base branch's parser read
 * the school as "Development". So a change that touches both is read again by the base branch's parser.
 */

/** The parser `audit:ats` grades the print with, whose imports make up the rest of it. */
export const PARSER = 'core/AtsTextParser.js';

/** The heading AGENTS.md lists what renders the CV under, for the product review. */
const PRODUCT_REVIEW = /^###\s+When the product review runs\s*$/m;

/** Inline code that reads as a path: a slash or a file extension, and nothing a path would not hold. */
const PATH = /^[\w.@-]+(\/[\w.@-]*)*$/;

/**
 * The paths AGENTS.md's product review runs on, read from the first paragraph under its heading: the one list of what
 * renders the CV, so the step and the review can never disagree about it.
 * @param {string} markdown - AGENTS.md
 * @returns {string[]} The paths, a directory ending in `/`; none when the section is not there
 */
export function productReviewPaths(markdown) {
  const heading = PRODUCT_REVIEW.exec(String(markdown ?? ''));
  if (!heading) return [];
  const after = markdown.slice(heading.index + heading[0].length).replace(/^\s*\n/, '');
  const paragraph = after.split(/\n\s*\n/)[0];
  return [
    ...new Set(
      [...paragraph.matchAll(/`([^`\n]+)`/g)]
        .map(([, code]) => code.trim())
        .filter((code) => PATH.test(code))
        .filter((code) => code.includes('/') || /\.\w+$/.test(code))
    )
  ];
}

/**
 * The changed files a set of paths holds: a path ending in `/` holds everything under it, any other only itself.
 * @param {string[]} changed - Changed files, relative to the repository root
 * @param {string[]} paths - Files and directories
 * @returns {string[]} The changed files among them, in the order given
 */
export function within(changed, paths) {
  return changed.filter((file) =>
    paths.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path))
  );
}

/**
 * Whether a change touches both the parser and what renders the CV, and why.
 *
 * Only both is a question for the base branch's parser. A change to the parser alone reads the same print the base's
 * parser read; a change to the print alone is read by `audit:ats` with the base's own parser, since it is unchanged.
 * @param {string[]} changed - The files `base...HEAD` changes
 * @param {{ parser: string[], rendering: string[] }} sets - The parser's modules, and the paths that render the CV
 * @returns {{ applies: boolean, parser: string[], rendering: string[], reason: string }} The decision
 */
export function applicability(changed, { parser, rendering }) {
  const touched = { parser: within(changed, parser), rendering: within(changed, rendering) };
  const list = (files) => files.join(', ');
  const reason =
    touched.parser.length && touched.rendering.length
      ? `it changes the parser (${list(touched.parser)}) and what renders the CV (${list(touched.rendering)})`
      : touched.parser.length
        ? `it changes the parser (${list(touched.parser)}) but nothing that renders the CV, so the print is the one the base's parser already reads`
        : touched.rendering.length
          ? `it changes what renders the CV (${list(touched.rendering)}) but not the parser, so audit:ats already reads this print with the base's parser`
          : 'it changes neither the parser nor what renders the CV';
  return {
    applies: Boolean(touched.parser.length && touched.rendering.length),
    ...touched,
    reason
  };
}

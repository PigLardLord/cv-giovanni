import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Read a project file as text.
 * @param {string} relativePath - Path relative to the project root
 * @returns {string} File contents
 */
export function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

/**
 * Extract the body of an at-rule block, so its rules can be asserted on in
 * isolation from the ones outside it.
 * @param {string} css - Stylesheet source
 * @param {string} prelude - At-rule prelude, e.g. `@media (max-width: 600px)`
 * @returns {string} Declarations inside the block, or an empty string
 */
export function atRuleBody(css, prelude) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const wanted = prelude.replace(/\s+/g, ' ').trim();
  const start = source.replace(/\s+/g, ' ').indexOf(`${wanted} {`);
  if (start === -1) return '';

  return blockAt(source.replace(/\s+/g, ' '), start);
}

/**
 * Read the block that opens at the first `{` at or after `from`.
 * @param {string} source - Stylesheet source
 * @param {number} from - Index to start looking from
 * @returns {string} Block contents without the outer braces
 */
function blockAt(source, from) {
  const open = source.indexOf('{', from);
  let depth = 0;

  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    if (source[at] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, at);
    }
  }

  return '';
}

const CONDITIONAL_AT_RULE = /@(media|supports|container|document)\b/;

/**
 * Drop the conditional at-rule blocks, leaving the rules that always apply.
 *
 * A conditional rule is a different contract from the one it overrides: the
 * `.contact-line` inside a narrow-viewport media query must not answer for the
 * `.contact-line` that governs every other width. Rules such as `@page` carry
 * declarations of their own and are asked for by name, so they stay.
 * @param {string} css - Stylesheet source
 * @returns {string} Stylesheet without its conditional blocks
 */
function stripAtRules(css) {
  let source = css;
  let at = source.search(CONDITIONAL_AT_RULE);

  while (at !== -1) {
    const body = blockAt(source, at);
    const end = source.indexOf(body, source.indexOf('{', at)) + body.length + 1;
    source = source.slice(0, at) + source.slice(end);
    at = source.search(CONDITIONAL_AT_RULE);
  }

  return source;
}

/**
 * Collect the declaration block(s) of every unconditional rule whose selector
 * list contains the given selector. Comments and at-rule blocks are stripped
 * first, so a media query cannot answer for the rule it overrides.
 * @param {string} css - Stylesheet source
 * @param {string} selector - Exact selector to look for
 * @returns {string} Concatenated declarations
 */
export function ruleBody(css, selector) {
  const ruleMatcher = /([^{}]+)\{([^{}]*)\}/g;
  const wanted = selector.replace(/\s+/g, ' ').trim();
  const source = stripAtRules(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  let match;
  let body = '';

  while ((match = ruleMatcher.exec(source)) !== null) {
    const selectors = match[1]
      .split(',')
      .map((candidate) => candidate.replace(/\s+/g, ' ').trim());
    if (selectors.includes(wanted)) {
      body += `${match[2]};`;
    }
  }

  return body;
}

/**
 * Read the last declared value of a property for a selector.
 * @param {string} css - Stylesheet source
 * @param {string} selector - Exact selector to look for
 * @param {string} property - CSS property name
 * @returns {string|null} Declared value without `!important`, or null
 */
export function declaration(css, selector, property) {
  const body = ruleBody(css, selector);
  const declarationMatcher = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'gi');
  let match;
  let value = null;

  while ((match = declarationMatcher.exec(body)) !== null) {
    value = match[1].replace(/!important/i, '').trim();
  }

  return value;
}

/**
 * Parse a single CSS length into its numeric value.
 * @param {string|null} value - Declared value such as `9.5pt`
 * @returns {number|null} Numeric part, or null when absent/unparseable
 */
export function lengthValue(value) {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

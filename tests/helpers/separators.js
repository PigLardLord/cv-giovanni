import { SEPARATOR_GLYPH } from '../../renderers/inlineSeparator.js';

const NO_BREAK_SPACE = '\u00A0';

/**
 * Every place in a subtree where a separator could end up at a line edge.
 *
 * Two shapes of separator have to be checked, and each is safe for a different
 * reason.
 *
 * A separator *element* is an atomic inline box: Chromium may break the line on
 * either side of it. It is therefore only ever safe strictly between two items
 * of a line that cannot wrap — at the edge of one, or beside another separator,
 * the glyph is one wrap away from opening or closing a rendered line.
 *
 * A separator inside *text* is safe only when both of the spaces around it are
 * no-break spaces: the line stays free to wrap between words, but never around
 * the glyph.
 * @param {Element} scope - Subtree to inspect
 * @returns {string[]} One description per fault; empty when the subtree is safe
 */
export function separatorFaults(scope) {
  return [...elementFaults(scope), ...textFaults(scope)];
}

function elementFaults(scope) {
  const faults = [];

  separatorElements(scope).forEach((separator) => {
    const siblings = renderedChildren(separator.parentNode);
    const index = siblings.indexOf(separator);
    const line = quote(separator.parentNode.textContent);

    if (index === 0) faults.push(`separator opens ${line}`);
    if (index === siblings.length - 1) faults.push(`separator ends ${line}`);
    if (isSeparator(siblings[index - 1]) || isSeparator(siblings[index + 1])) {
      faults.push(`separator has no item beside it in ${line}`);
    }
  });

  return faults;
}

function textFaults(scope) {
  const faults = [];

  textNodes(scope).forEach((node) => {
    if (isInsideSeparator(node)) return;

    const text = node.nodeValue;
    for (let at = text.indexOf(SEPARATOR_GLYPH); at !== -1; at = text.indexOf(SEPARATOR_GLYPH, at + 1)) {
      if (text[at - 1] !== NO_BREAK_SPACE || text[at + 1] !== NO_BREAK_SPACE) {
        faults.push(`separator is free to wrap in ${quote(text)}`);
      }
    }
  });

  return faults;
}

function separatorElements(scope) {
  const found = [...scope.querySelectorAll('.inline-separator')];
  return isSeparator(scope) ? [scope, ...found] : found;
}

function renderedChildren(parent) {
  return [...parent.childNodes].filter(
    (node) => node.nodeType !== 3 || node.nodeValue.trim() !== ''
  );
}

function isSeparator(node) {
  return !!node && node.nodeType === 1 && node.classList.contains('inline-separator');
}

function isInsideSeparator(node) {
  return !!node.parentElement && !!node.parentElement.closest('.inline-separator');
}

function textNodes(scope) {
  const nodes = [];
  const collect = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) nodes.push(child);
      else collect(child);
    });
  };
  collect(scope);
  return nodes;
}

function quote(text) {
  return `"${text.replace(/\s+/g, ' ').trim()}"`;
}

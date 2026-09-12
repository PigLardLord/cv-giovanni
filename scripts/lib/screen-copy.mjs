/**
 * What a reader copies off the page, checked against what the profile wrote.
 *
 * The unit tests read the page through JSDOM, which lays nothing out and applies no stylesheet, so
 * they cannot see what a selection holds: punctuation the stylesheet draws never reaches it, and
 * decoration written as text always does. #56 shipped a Nerd Mode whose selection read
 * `SwiftSwiftUIUIKit`; the words were right and only Chrome showed them welded (#62).
 *
 * This module reads the copied text and the profile and nothing else, so each rule can be shown to
 * fail on text that breaks it.
 */

import { readableAddress } from '../../domain/ReadableUrl.js';

/** A pictograph anywhere on a line: the data writes words, and decoration drawn as text copies. */
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** A line holding only a short number: a line number the editor meant to draw, not to write. */
const LINE_NUMBER = /^\s*\d{1,3}\s*$/;

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Two neighbours the page writes in sequence, which a selection must never join into one word. */
function neighbours(profile) {
  const groups = profile.skills || [];
  const interests = profile.interests || [];
  return [
    ...groups.flatMap(({ category, items = [] }) => {
      const names = items.map((item) => item.name);
      return [[category, names[0]], ...names.slice(1).map((name, index) => [names[index], name])];
    }),
    ...(profile.languages || []).map(({ name, level }) => [name, level]),
    ...interests.slice(1).map((interest, index) => [interests[index], interest])
  ].filter(([first, second]) => first && second);
}

/** Every string the profile writes, however deep. */
const authored = (node) =>
  typeof node === 'string'
    ? [node]
    : node && typeof node === 'object'
      ? Object.values(node).flatMap(authored)
      : [];

const spaced = (text) => String(text).replace(/\s+/g, ' ').trim();

/**
 * What a selection of the whole CV must hold: the identity, and the evidence — every role, its
 * achievements, every degree and school, certification, skill, language and interest. Four identity
 * strings alone once passed a selection that had missed nearly all of it.
 */
const substance = (profile) =>
  [
    profile.name,
    profile.title,
    profile.email,
    ...(profile.relevant_experience || []).flatMap((job) => [
      job.title,
      job.company,
      ...(job.highlights || [])
    ]),
    ...(profile.education || []).flatMap((item) => [item.degree, item.school]),
    ...(profile.certifications || []).map((item) => item.name),
    ...(profile.skills || []).flatMap((group) => (group.items || []).map((item) => item.name)),
    ...(profile.languages || []).map((language) => language.name),
    ...(profile.interests || [])
  ]
    .filter(Boolean)
    .map(spaced);

/** The contact details the page writes as values, in the form a reader copies them. */
const contactValues = (profile) =>
  [
    profile.location,
    profile.email,
    profile.phone,
    ...(profile.social || []).map((item) => readableAddress(item.url)),
    profile.portfolio && readableAddress(profile.portfolio)
  ].filter(Boolean);

/**
 * A contact detail touching a letter or a digit on either side has run into its neighbour. A selection
 * reading `…@gmail.comPhone:` hands a form an address that does not exist.
 */
const runInto = (flat, value) =>
  [
    ...flat.matchAll(
      new RegExp(`([\\p{L}\\p{N}]+)?${escapeForRegExp(value)}([\\p{L}\\p{N}]+)?`, 'gu')
    )
  ]
    .filter(([, before, after]) => before || after)
    .map(([joined]) => joined);

/**
 * Each category must head its own lines and be followed there by its own first skill. A category is
 * a line of its own, whatever case it is drawn in; a mention inside another group's skills is not
 * one, and a list that reaches the reader under another heading is attached, as far as the reader
 * can tell, to that one.
 */
function detachedCategories(lines, groups, skillsLabel) {
  const heading = (line, category) => line.trim().toLowerCase() === category.toLowerCase();
  const from = skillsLabel
    ? lines.findIndex((line) => line.toLowerCase().includes(skillsLabel.toLowerCase()))
    : -1;
  return groups
    .filter(({ category, items = [] }) => {
      if (skillsLabel && from < 0) return true;
      const at = lines.findIndex((line, index) => index > from && heading(line, category));
      if (at < 0 || !items[0]) return true;
      const next = lines.findIndex(
        (line, index) => index > at && groups.some((group) => heading(line, group.category))
      );
      return !lines
        .slice(at + 1, next < 0 ? undefined : next)
        .join('\n')
        .includes(items[0].name);
    })
    .map((group) => group.category);
}

/** Where a whole name ends on a line, or -1: `German` is not the start of `Germany`. */
const nameEnd = (line, name) => {
  const match = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeForRegExp(name)}(?![\\p{L}\\p{N}])`,
    'u'
  ).exec(line);
  return match ? match.index + match[0].length : -1;
};

/**
 * @param {string} copied - What the selection copied
 * @param {object} profile - The profile the page was rendered from
 * @param {{ skillsLabel?: string }} [options] - The skills section's label, where the lists begin
 * @returns {{ checks: Record<string, boolean>, findings: Record<string, string[]> }} Each check, and
 *   the text that broke it
 */
export function screenCopy(copied, profile, { skillsLabel } = {}) {
  const lines = copied.split('\n');
  const flat = spaced(copied);
  const strings = authored(profile).map(spaced);
  const writtenAs = (text) => strings.some((string) => string.includes(text));

  const findings = {
    missing: substance(profile).filter((text) => !flat.includes(text)),
    welded: [
      ...neighbours(profile)
        .map(([first, second]) => `${first}${second}`)
        .filter((joined) => flat.includes(joined) && !writtenAs(joined)),
      ...contactValues(profile).flatMap((value) => runInto(flat, value))
    ],
    detached: detachedCategories(lines, profile.skills || [], skillsLabel),
    unlevelled: (profile.languages || [])
      .filter(({ name, level }) =>
        lines.every((line) => {
          const end = nameEnd(line, name);
          return end < 0 || line.indexOf(level, end) < 0;
        })
      )
      .map((language) => language.name),
    unwritten: lines
      .filter(
        (line) =>
          PICTOGRAPH.test(line) || (LINE_NUMBER.test(line) && !strings.includes(line.trim()))
      )
      .map((line) => line.trim())
  };

  return {
    checks: {
      captured: findings.missing.length === 0,
      notWelded: findings.welded.length === 0,
      skillsAttached: findings.detached.length === 0,
      languagesLevelled: findings.unlevelled.length === 0,
      nothingUnwritten: findings.unwritten.length === 0
    },
    findings
  };
}

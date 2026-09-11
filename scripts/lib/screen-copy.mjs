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

/** A pictograph anywhere on a line: the data writes words, and decoration drawn as text copies. */
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** A line holding only a short number: a line number the editor meant to draw, not to write. */
const LINE_NUMBER = /^\s*\d{1,3}\s*$/;

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a label starts, whatever case the stylesheet drew it in and Chrome copied it in. */
const labelAt = (flat, label) => (label ? flat.search(new RegExp(escapeForRegExp(label), 'i')) : 0);

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

/**
 * Each category must be followed by its own first skill before any other category: a list that
 * reaches the reader after another label is attached, as far as the reader can tell, to that one.
 */
function detachedCategories(flat, groups, from) {
  const categories = groups.map((group) => group.category);
  return groups
    .filter(({ category, items = [] }) => {
      const at = from < 0 ? -1 : flat.indexOf(category, from);
      if (at < 0 || !items[0]) return true;
      const after = at + category.length;
      const first = flat.indexOf(items[0].name, after);
      const next =
        categories
          .filter((name) => name !== category)
          .map((name) => flat.indexOf(name, after))
          .filter((index) => index >= 0)
          .sort((a, b) => a - b)[0] ?? Infinity;
      return first < 0 || first > next;
    })
    .map((group) => group.category);
}

/**
 * @param {string} copied - What the selection copied
 * @param {object} profile - The profile the page was rendered from
 * @param {{ skillsLabel?: string }} [options] - The skills section's label, where the lists begin
 * @returns {{ checks: Record<string, boolean>, findings: Record<string, string[]> }} Each check, and
 *   the text that broke it
 */
export function screenCopy(copied, profile, { skillsLabel } = {}) {
  const lines = copied.split('\n');
  const flat = copied.replace(/\s+/g, ' ');
  const required = [
    profile.name,
    profile.title,
    profile.email,
    profile.relevant_experience?.[0]?.company
  ].filter(Boolean);

  const findings = {
    missing: required.filter((text) => !flat.includes(text)),
    welded: neighbours(profile)
      .map(([first, second]) => `${first}${second}`)
      .filter((joined) => flat.includes(joined)),
    detached: detachedCategories(flat, profile.skills || [], labelAt(flat, skillsLabel)),
    unlevelled: (profile.languages || [])
      .filter(
        ({ name, level }) =>
          !lines.some(
            (line) =>
              line.includes(name) && line.indexOf(level, line.indexOf(name) + name.length) >= 0
          )
      )
      .map((language) => language.name),
    unwritten: lines
      .filter((line) => PICTOGRAPH.test(line) || LINE_NUMBER.test(line))
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

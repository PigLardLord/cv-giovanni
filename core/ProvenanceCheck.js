import { fold } from '../domain/fold.js';
import { driftingSpans } from '../domain/StatedSpans.js';
import { AdvertMatcher } from './AdvertMatcher.js';
import { ProfileShape } from './ProfileShape.js';

/** The fields that say who the candidate is. A tailoring copies them; it never writes them (#260). */
const IDENTITY = Object.freeze([
  'name',
  'email',
  'phone',
  'location',
  'portfolio',
  'availability',
  'workAuthorisation',
  'asOf'
]);

/** A figure, as a run of digits: "37.7", "30k" and "2020–2023" state 377, 30, 2020 and 2023. */
const FIGURE = /\d+(?:[.,]\d+)*/g;

/** A word, as the capitalised-name rule reads one: letters and digits, with the marks technologies carry. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}+#.'’-]*/gu;

/**
 * Whether a tailored CV says only what its source says (#260, #284).
 *
 * A tailoring may choose, order, shorten and reword. It may not add. This is the mechanical half of that rule: it
 * cannot judge whether a rewording is fair, but it can refuse every fact a rewording brought with it — a figure, a
 * date, an employer, a product or a technology the source item does not state — and every role, skill, degree or
 * identity field the source does not have. What it checks, item by item:
 *
 * - the profile has the profile's shape, and states no span the calendar will overtake (#104);
 * - the identity is the source's, unchanged;
 * - every role names its source role, with the same employer, title and period;
 * - every achievement names its source achievements, in that same role, and states nothing they do not;
 * - every career highlight names the items it comes from, and the summary states nothing the source does not;
 * - every skill, degree, certification, language and interest is one the source lists.
 *
 * "States nothing they do not" is three tests, and a word fails any of them: its figures are among the source's; a
 * name — a word written with a capital, where a sentence does not begin — appears in the source; and a term the
 * advert or the source's skills name appears in the source when it appears in the tailoring. The second is English's
 * rule, where only names are capitalised; a language that capitalises its nouns needs another (#260, step 6).
 */
export class ProvenanceCheck {
  /**
   * @param {object} tailoring - What to compare
   * @param {object} tailoring.source - The CV the tailoring started from
   * @param {object} tailoring.tailored - The tailored profile
   * @param {Object<string, string|string[]>} tailoring.sources - For each tailored item, the source items it came from,
   *   by path: `{ "relevant_experience[0].highlights[1]": "relevant_experience[2].highlights[0]" }`
   * @param {string[]} [tailoring.terms] - The advert's terms, and anything else a tailoring must not bring in
   * @returns {{ path: string, reason: string }[]} Every failure, in the order of the profile; none when it holds
   */
  static failures({ source, tailored, sources = {}, terms = [] }) {
    const shape = ProfileShape.problems(tailored);
    if (shape.length)
      return shape.map(({ path, reason }) => ({ path, reason: `${reason} (the profile's shape)` }));

    const found = [];
    const fail = (path, reason) => found.push({ path, reason });
    const whole = textOf(source);
    const vocabulary = [
      ...terms,
      ...(source.skills || []).flatMap((group) => (group.items || []).map((item) => item.name))
    ].filter(Boolean);
    const states = (path, text, against) => {
      for (const reason of ProvenanceCheck.additions(text, against, vocabulary)) fail(path, reason);
    };

    for (const key of IDENTITY) {
      if (!same(tailored[key], source[key])) fail(key, "is the source's identity, and changed");
    }
    if (!same(tailored.social ?? [], source.social ?? []))
      fail('social', "is the source's links, and changed");
    const titles = [source.title, ...(source.relevant_experience || []).map((role) => role.title)];
    if (tailored.title !== undefined && !titles.includes(tailored.title)) {
      fail('title', 'is neither the source’s title nor the title of a role it lists');
    }
    if (tailored.subtitle) states('subtitle', tailored.subtitle, whole);
    if (tailored.profile) states('profile', tailored.profile, whole);

    (tailored.career_highlights || []).forEach((highlight, index) => {
      const path = `career_highlights[${index}]`;
      const from = ProvenanceCheck.sourcesOf(sources, path, source, fail);
      if (from) states(path, highlight, from.map(({ value }) => textOf(value)).join('\n'));
    });

    (tailored.relevant_experience || []).forEach((role, index) => {
      const path = `relevant_experience[${index}]`;
      const [origin] = ProvenanceCheck.sourcesOf(sources, path, source, fail, { one: true }) || [];
      if (!origin) return;
      if (!/^relevant_experience\[\d+\]$/.test(origin.path)) {
        fail(path, `names ${origin.path} as its source, which is not a role`);
        return;
      }
      for (const key of ['company', 'title', 'period']) {
        if (role[key] !== origin.value[key])
          fail(`${path}.${key}`, `is not ${origin.path}'s ${key}`);
      }
      if (role.location !== undefined && role.location !== origin.value.location) {
        fail(`${path}.location`, `is not ${origin.path}'s location`);
      }
      const roleText = textOf(origin.value);
      if (role.summary) states(`${path}.summary`, role.summary, roleText);
      if (role.description) states(`${path}.description`, role.description, roleText);
      (role.highlights || []).forEach((highlight, at) => {
        const itemPath = `${path}.highlights[${at}]`;
        const from = ProvenanceCheck.sourcesOf(sources, itemPath, source, fail);
        if (!from) return;
        const elsewhere = from.find(
          ({ path: sourcePath }) => !sourcePath.startsWith(`${origin.path}.`)
        );
        if (elsewhere) {
          fail(
            itemPath,
            `names ${elsewhere.path}, which is not in its role's source, ${origin.path}`
          );
          return;
        }
        // The role's employer goes without saying inside the role: "at Cortado" adds nothing its source lacks.
        states(
          itemPath,
          highlight,
          [...from.map(({ value }) => textOf(value)), role.company].join('\n')
        );
      });
    });

    const listedSkills = new Set(
      (source.skills || []).flatMap((group) => (group.items || []).map((item) => fold(item.name)))
    );
    (tailored.skills || []).forEach((group, index) => {
      states(`skills[${index}].category`, group.category, whole);
      (group.items || []).forEach((item, at) => {
        if (!listedSkills.has(fold(item.name))) {
          fail(`skills[${index}].items[${at}]`, `"${item.name}" is not a skill the source lists`);
        }
      });
    });
    for (const [key, what] of [
      ['education', 'degree'],
      ['certifications', 'certification'],
      ['languages', 'language']
    ]) {
      (tailored[key] || []).forEach((entry, index) => {
        if (!(source[key] || []).some((candidate) => same(entry, candidate))) {
          fail(`${key}[${index}]`, `is not a ${what} the source lists, as it lists it`);
        }
      });
    }
    (tailored.interests || []).forEach((interest, index) => {
      if (!(source.interests || []).includes(interest)) {
        fail(`interests[${index}]`, 'is not an interest the source lists');
      }
    });

    for (const { field, said, why } of driftingSpans(tailored)) {
      fail(field, `"${said}": ${why}`);
    }
    return found;
  }

  /**
   * What a tailored text states that its source does not: a figure, a name, or a term of the vocabulary.
   * @param {string} text - The tailored text
   * @param {string} against - Everything its sources say
   * @param {string[]} vocabulary - Terms that must not appear without a source
   * @returns {string[]} A reason for each addition
   */
  static additions(text, against, vocabulary = []) {
    const reasons = [];
    const figures = new Set((against.match(FIGURE) || []).map(digits));
    const added = [
      ...new Set((text.match(FIGURE) || []).filter((figure) => !figures.has(digits(figure))))
    ];
    for (const figure of added) reasons.push(`states ${figure}, which its source does not`);

    const folded = fold(against);
    const names = [...new Set(ProvenanceCheck.names(text))].filter(
      (name) => !AdvertMatcher.contains(folded, fold(name))
    );
    for (const name of names) reasons.push(`names "${name}", which its source does not`);

    // A term whose words were named above is one addition, already said.
    const said = new Set(names.map((name) => fold(name)));
    for (const term of new Set(vocabulary)) {
      if (
        fold(term)
          .split(' ')
          .some((word) => said.has(word))
      )
        continue;
      if (AdvertMatcher.appears(term, text) && !AdvertMatcher.appears(term, against)) {
        reasons.push(`says "${term}", which its source does not`);
      }
    }
    return reasons;
  }

  /**
   * The names a text writes: every word with a capital letter, or with a digit among its letters, except where a
   * sentence or a clause after a colon begins — "Moved" there is a verb, "SwiftUI" anywhere is a name.
   * @param {string} text - English text
   * @returns {string[]} The names, as written
   */
  static names(text) {
    const found = [];
    for (const match of String(text ?? '').matchAll(WORD)) {
      const word = match[0].replace(/[.'’-]+$/, '');
      const before = text.slice(0, match.index).trimEnd();
      const opens = before === '' || /[.!?:;•–—]$/.test(before);
      const capitalised = /\p{Lu}/u.test(opens ? word.slice(1) : word);
      const mixed = /\p{N}/u.test(word) && /\p{L}/u.test(word);
      if (capitalised || mixed) found.push(word);
    }
    return found;
  }

  /**
   * The source items a tailored item names, each with its path and its value, or null after saying what is wrong.
   * @param {object} [options] - `one`: the item must name exactly one
   */
  static sourcesOf(sources, path, source, fail, { one = false } = {}) {
    const named = sources[path];
    const paths = typeof named === 'string' ? [named] : Array.isArray(named) ? named : [];
    if (!paths.length || paths.some((item) => typeof item !== 'string')) {
      fail(path, 'names no source item');
      return null;
    }
    if (one && paths.length > 1) {
      fail(path, 'names more than one source role');
      return null;
    }
    const resolved = paths.map((item) => ({ path: item, value: at(source, item) }));
    const missing = resolved.find(({ value }) => value === undefined);
    if (missing) {
      fail(path, `names ${missing.path}, which the source does not have`);
      return null;
    }
    return resolved;
  }
}

/** A value at a path such as `relevant_experience[2].highlights[0]`, or undefined. */
function at(value, path) {
  const steps = String(path).match(/[^.[\]]+/g) || [];
  if (!/^[a-z_]+(\[\d+\]|\.[a-z_]+)*$/i.test(path)) return undefined;
  return steps.reduce(
    (current, step) => (current && typeof current === 'object' ? current[step] : undefined),
    value
  );
}

/** Every string a value holds, joined: what a source item says. */
function textOf(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).join('\n');
  return '';
}

/** Two values that write the same thing, whatever order their fields come in; a missing one and a null alike. */
function same(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** A value with its fields in one order, and without the ones that hold nothing. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined && value[key] !== null)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value ?? null;
}

/** A figure's digits. */
function digits(figure) {
  return figure.replace(/[.,]/g, '');
}

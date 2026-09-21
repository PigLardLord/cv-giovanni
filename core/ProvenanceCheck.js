import { AdvertLexicon } from '../domain/AdvertLexicon.js';
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

/** A figure written in numerals: "37.7", "1,040", "30" of "~30k", and each end of "2020–2023". */
const FIGURE = /\d+(?:[.,]\d+)*/g;

/**
 * The figures English writes in words, as a CV writes them. "One" is left out: it is a pronoun as often as a number,
 * and "the first one" states no figure.
 */
const UNITS = Object.freeze({
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9
});
const NUMBERS = Object.freeze({
  ...UNITS,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  dozen: 12,
  hundred: 100,
  thousand: 1000,
  million: 1000000
});
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const NUMBER_WORD = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(${TENS})-(${Object.keys(UNITS).join('|')})|(${Object.keys(NUMBERS).join('|')}))(?![\\p{L}\\p{N}])`,
  'giu'
);

/** A word, as the name rule reads one: letters and digits, with the marks technologies carry. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}+#.'’-]*/gu;

/** Where an achievement comes from: an achievement. A career highlight may come from one, or from another highlight. */
const ACHIEVEMENT = /^relevant_experience\[\d+\]\.highlights\[\d+\]$/;
const HIGHLIGHT = /^(?:career_highlights\[\d+\]|relevant_experience\[\d+\]\.highlights\[\d+\])$/;
const ROLE = /^relevant_experience\[\d+\]$/;

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
 * - every role names one source role, its own, with the same employer, title, period and location;
 * - every achievement names achievements of that same role, and states nothing they do not;
 * - every career highlight names the achievements or highlights it comes from; the summary, the subtitle and a skill
 *   category state nothing the whole source does not;
 * - every skill, degree, certification, language and interest is one the source lists.
 *
 * "States nothing they do not" is four tests, and a text fails any of them:
 *
 * - its figures, in numerals or in words, are among the source's — "5.2" and "52" are two figures;
 * - its names are in the source. English capitalises only names, so a name is a word with a capital where no sentence
 *   begins, or one mixing letters and digits; "Swift's" is Swift, and "SwiftUI-based" is SwiftUI;
 * - at a sentence's start, where a capital says nothing, a name the advert writes is in the source;
 * - a term of the advert's, a skill of the source's, and any word the advert writes that the source never does, is in
 *   the source when it is in the tailoring.
 *
 * What none of them sees is a technology in neither the advert nor the source, written in lower case or at the start
 * of a sentence (#292). The first two tests are English's; a language that capitalises its nouns needs its own (#260,
 * step 6).
 */
export class ProvenanceCheck {
  /**
   * @param {object} tailoring - What to compare
   * @param {object} tailoring.source - The CV the tailoring started from
   * @param {object} tailoring.tailored - The tailored profile
   * @param {Object<string, string|string[]>} tailoring.sources - For each tailored item, the source items it came from,
   *   by path: `{ "relevant_experience[0].highlights[1]": "relevant_experience[2].highlights[0]" }`
   * @param {string[]} [tailoring.terms] - The advert's terms a tailoring must not bring in
   * @param {string} [tailoring.advert] - The advert, whose names and words a tailoring must not bring in either
   * @returns {{ path: string, reason: string }[]} Every failure, in the order of the profile; none when it holds
   */
  static failures({ source, tailored, sources = {}, terms = [], advert = '' }) {
    const shape = ProfileShape.problems(tailored);
    if (shape.length)
      return shape.map(({ path, reason }) => ({ path, reason: `${reason} (the profile's shape)` }));

    const found = [];
    const fail = (path, reason) => found.push({ path, reason });
    const whole = textOf(source);
    const vocabulary = [
      ...terms,
      ...(source.skills || []).flatMap((group) => (group.items || []).map((item) => item.name)),
      ...ProvenanceCheck.wordsOnlyIn(advert, whole)
    ].filter(Boolean);
    // Its plain words open its bullets too — "Across teams", "Strong Swift" — and are no names (the review of #286).
    const advertNames = new Set(
      ProvenanceCheck.names(advert, { openers: true })
        .filter((word) => !AdvertLexicon.isStopword(word))
        .map(fold)
    );
    const states = (path, text, against) => {
      for (const reason of ProvenanceCheck.additions(text, against, { vocabulary, advertNames })) {
        fail(path, reason);
      }
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
      const from = ProvenanceCheck.sourcesOf(sources, path, source, fail, {
        kind: HIGHLIGHT,
        what: 'an achievement or a highlight'
      });
      if (from) states(path, highlight, from.map(({ value }) => textOf(value)).join('\n'));
    });

    const named = new Map();
    (tailored.relevant_experience || []).forEach((role, index) => {
      const path = `relevant_experience[${index}]`;
      const [origin] =
        ProvenanceCheck.sourcesOf(sources, path, source, fail, {
          one: true,
          kind: ROLE,
          what: 'a role'
        }) || [];
      if (!origin) return;
      if (named.has(origin.path)) {
        fail(path, `names ${origin.path}, which ${named.get(origin.path)} already names`);
        return;
      }
      named.set(origin.path, path);
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
        const from = ProvenanceCheck.sourcesOf(sources, itemPath, source, fail, {
          kind: ACHIEVEMENT,
          what: 'an achievement'
        });
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
        // The role's employer and title go without saying inside the role: "at Cortado", "iOS releases".
        states(
          itemPath,
          highlight,
          [...from.map(({ value }) => textOf(value)), role.company, role.title].join('\n')
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
   * @param {{ vocabulary?: string[], advertNames?: Set<string> }} [words] - Terms that must not appear without a
   *   source, and the names the advert writes, folded
   * @returns {string[]} A reason for each addition
   */
  static additions(text, against, { vocabulary = [], advertNames = new Set() } = {}) {
    const reasons = [];
    const figures = new Set(figuresOf(against).map(({ value }) => value));
    const added = new Map();
    for (const { value, written } of figuresOf(text)) {
      if (!figures.has(value) && !added.has(value)) added.set(value, written);
    }
    for (const written of added.values())
      reasons.push(`states ${written}, which its source does not`);

    // Found as written, or through the synonym table. The table maps whole phrases: "test-driven development" in lower
    // case rewords "TDD" through the vocabulary below, while a capitalised "Test-driven" is read as a name of its own,
    // and refused where the source writes "TDD" — the prompt asks for names as the CV spells them.
    const sourced = (name) =>
      candidates(name).some((candidate) => AdvertMatcher.appears(candidate, against) !== null);
    const names = [...new Set(ProvenanceCheck.names(text))].filter((name) => !sourced(name));
    for (const name of names) reasons.push(`names "${name}", which its source does not`);
    const openers = [...new Set(ProvenanceCheck.openers(text))].filter(
      (word) => advertNames.has(fold(word)) && !sourced(word)
    );
    for (const word of openers) reasons.push(`names "${word}", which its source does not`);

    // A term whose words were named above is one addition, already said.
    const said = new Set(
      [...names, ...openers].flatMap((name) =>
        candidates(name).flatMap((part) => fold(part).split(' '))
      )
    );
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
   * sentence begins — "Moved" there is a verb, "SwiftUI" anywhere is a name. After a colon, a semicolon or a dash a
   * sentence goes on, and a capital there is a name.
   * @param {string} text - English text
   * @param {{ openers?: boolean }} [options] - Whether a capitalised word that opens a sentence counts too
   * @returns {string[]} The names, as written
   */
  static names(text, { openers = false } = {}) {
    const found = [];
    for (const { word, opens } of words(text)) {
      const capitalised = /\p{Lu}/u.test(opens && !openers ? word.slice(1) : word);
      const mixed = /\p{N}/u.test(word) && /\p{L}/u.test(word);
      if (capitalised || mixed) found.push(word);
    }
    return found;
  }

  /** The capitalised words that open a sentence, where a capital says nothing about a name. */
  static openers(text) {
    return words(text)
      .filter(({ word, opens }) => opens && /^\p{Lu}/u.test(word) && !/\p{Lu}/u.test(word.slice(1)))
      .map(({ word }) => word);
  }

  /**
   * The words an advert writes that its source never does: each is a claim the source cannot back, whatever case it
   * is written in — "kotlin multiplatform" under Requirements is as much a technology as "Kotlin Multiplatform".
   * @param {string} advert - The advert
   * @param {string} source - Everything the source says
   * @returns {string[]} The words
   */
  static wordsOnlyIn(advert, source) {
    const folded = fold(source);
    return [
      ...new Set(
        words(advert)
          .map(({ word }) => word)
          .filter(
            (word) => word.length >= 3 && /\p{L}/u.test(word) && !AdvertLexicon.isStopword(word)
          )
          .filter((word) => !AdvertMatcher.contains(folded, fold(word)))
      )
    ];
  }

  /**
   * The source items a tailored item names, each with its path and its value, or null after saying what is wrong.
   * @param {object} [options] - `one`: the item must name exactly one; `kind`: the paths it may name, and `what` they
   *   are, for the refusal
   */
  static sourcesOf(sources, path, source, fail, { one = false, kind, what } = {}) {
    const named = Object.hasOwn(sources, path) ? sources[path] : undefined;
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
    const other = kind && resolved.find(({ path: item }) => !kind.test(item));
    if (other) {
      fail(path, `names ${other.path} as its source, which is not ${what}`);
      return null;
    }
    return resolved;
  }
}

/** Every word of a text, and whether it opens a sentence: at the start, or after a full stop, a "!" or a "?". */
function words(text) {
  const value = String(text ?? '');
  return [...value.matchAll(WORD)].map((match) => {
    const before = value.slice(0, match.index).trimEnd();
    return {
      word: match[0].replace(/[.'’-]+$/, ''),
      opens: before === '' || /[.!?•\n]$/.test(before)
    };
  });
}

/** What a name may be found in its source as: itself, without a possessive, or its capitalised parts. */
function candidates(name) {
  const stem = name.replace(/['’]s$/, '');
  const parts = stem.split('-').filter((part) => /\p{Lu}|\p{N}/u.test(part));
  const compound = stem.includes('-') && parts.length ? [parts.join(' ')] : [];
  return [...new Set([name, stem, ...compound])];
}

/** A text's figures, each as written and as a value: numerals with their separators read, and number words. */
function figuresOf(text) {
  const value = String(text ?? '');
  const numerals = (value.match(FIGURE) || []).map((written) => ({
    written,
    value: written.replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1').replace(',', '.')
  }));
  const spelled = [...value.matchAll(NUMBER_WORD)].map((match) => ({
    written: match[0],
    value: String(
      match[3] !== undefined
        ? NUMBERS[match[3].toLowerCase()]
        : NUMBERS[match[1].toLowerCase()] + NUMBERS[match[2].toLowerCase()]
    )
  }));
  return [...numerals, ...spelled];
}

/** A value at a path such as `relevant_experience[2].highlights[0]`, or undefined: own fields and indexes only. */
function at(value, path) {
  if (!/^[a-z_]+(\[\d+\]|\.[a-z_]+)*$/i.test(path)) return undefined;
  const steps = String(path).match(/[^.[\]]+/g) || [];
  return steps.reduce((current, step) => {
    if (Array.isArray(current)) return /^\d+$/.test(step) ? current[Number(step)] : undefined;
    if (
      current &&
      typeof current === 'object' &&
      Object.getPrototypeOf(current) === Object.prototype
    ) {
      return Object.hasOwn(current, step) ? current[step] : undefined;
    }
    return undefined;
  }, value);
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

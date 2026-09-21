import { AdvertLexicon } from '../domain/AdvertLexicon.js';
import { CoverLetter } from '../domain/CoverLetter.js';
import { DateRange, MONTHS } from '../domain/DateRange.js';
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

/**
 * A figure written in numerals: "37.7", "1,040", "~30k", and each end of "2020–2023". Not a version a name carries:
 * "iOS17" and "v2.0" state no 17 and no 0 (the review of #300).
 */
const FIGURE = /(?<![\p{L}\p{N}.])\d+(?:[.,]\d+)*(?:[kKM](?![\p{L}]))?/gu;

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
/** The same in German, for a CV translated into it (#299); "ein" and "eins" are left out, as "one" is. */
const GERMAN_NUMBERS = Object.freeze({
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  zwanzig: 20,
  dreißig: 30,
  vierzig: 40,
  fünfzig: 50,
  hundert: 100,
  tausend: 1000
});
const SPELLED = Object.freeze({ ...NUMBERS, ...GERMAN_NUMBERS });
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const NUMBER_WORD = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(${TENS})-(${Object.keys(UNITS).join('|')})|(${Object.keys(SPELLED).join('|')}))(?![\\p{L}\\p{N}])`,
  'giu'
);

/** A word, as the name rule reads one: letters and digits, with the marks technologies carry. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}+#.'’-]*/gu;

/** Where an achievement comes from: an achievement. A career highlight may come from one, or from another highlight. */
const ACHIEVEMENT = /^relevant_experience\[\d+\]\.highlights\[\d+\]$/;
const HIGHLIGHT = /^(?:career_highlights\[\d+\]|relevant_experience\[\d+\]\.highlights\[\d+\])$/;
const ROLE = /^relevant_experience\[\d+\]$/;

/** The identity a translation copies as it is, and the part of it a translation words in its own language (#299). */
const COPIED = Object.freeze(['name', 'email', 'phone', 'portfolio', 'asOf']);
const WORDED = Object.freeze(['location', 'availability', 'workAuthorisation']);

/** The words a title adds when it claims more seniority, in either language. */
const SENIORITY =
  /(?<![\p{L}])(senior|lead|leading|principal|staff|head|chief|director|manager|architect|leitend\p{L}*|\p{L}*(?:leiter|leitung|architekt)\p{L}*|chef\p{L}*|führungs\p{L}*)(?![\p{L}])/giu;

/** The words German writes as its own nouns that an English CV writes as names: "die App" is no name in German. */
const SHARED_NOUNS = new Set(
  [
    'app',
    'apps',
    'team',
    'teams',
    'client',
    'clients',
    'code',
    'release',
    'releases',
    'design',
    'feature',
    'features',
    'test',
    'tests',
    'build',
    'builds',
    'server',
    'support',
    'update',
    'updates',
    'tool',
    'tools',
    'framework',
    'frameworks',
    'store',
    'enterprise',
    'mobile',
    'partner',
    'intern',
    'system',
    'computer',
    'software'
  ].map(fold)
);

/**
 * A word written as a technology writes itself: a capital past its first letter, a digit among letters, a "+" or "#".
 * A German compound is read part by part: "App-Entwicklung" is two nouns, "SwiftUI-Client" holds a name.
 */
const technicalPart = (part) =>
  /\p{Lu}/u.test(part.slice(1)) ||
  (/\p{N}/u.test(part) && /\p{L}/u.test(part)) ||
  /[+#]/.test(part);

/** The legal form a company's name ends in, which its prose leaves out. */
const LEGAL_FORM =
  /[\s,]+(?:gmbh\s*&\s*co\.?\s*kga?a?|ug\s*\(haftungsbeschränkt\)|g?gmbh|kgaa|ag|se|kg|ug|e\.\s?v\.|s\.a\.|b\.v\.|ltd\.?|limited|inc\.?|llc|plc)\s*$/iu;

/** Abbreviations German writes its own way, and the English one a source writes: "KI" is "AI", "GER" is "CEFR". */
const GERMAN_ABBREVIATIONS = Object.freeze({ ki: 'AI', ger: 'CEFR', eu: 'EU' });

/** How English is read: only names are capitalised, so a capital where no sentence begins is a name. */
const ENGLISH = Object.freeze({
  translated: false,
  also: () => null,
  names: (text) => ProvenanceCheck.names(text),
  openers: (text) => ProvenanceCheck.openers(text),
  part: (part) => /\p{Lu}|\p{N}/u.test(part)
});

/**
 * How a translation is read. German capitalises every noun, so a capital says nothing: a name is a word written as a
 * technology writes itself, or one the full CV — and an English advert — writes as a name (#299).
 * @param {Set<string>} known - The names the full CV and an English advert write, folded
 */
function translatedReading(known) {
  // One rule for a word and for the parts a source may write it as: "Flutter-Kenntnisse" names Flutter as much as
  // "Flutter" does, and "Engine-Notes-App" is found as "Engine Notes" (the reviews of #300).
  const namePart = (part) =>
    technicalPart(part) || (known.has(fold(part)) && !SHARED_NOUNS.has(fold(part)));
  return Object.freeze({
    translated: true,
    names: (text) =>
      words(text)
        .map(({ word }) => word)
        .filter((word) =>
          word
            .replace(/['’]s$/, '')
            .split('-')
            .some(namePart)
        ),
    openers: () => [],
    part: namePart,
    also: (name) => GERMAN_ABBREVIATIONS[fold(name)] ?? null
  });
}

/** Two periods that are the same dates, in whichever language each writes its months. */
function samePeriod(a, b) {
  if (a === b) return true;
  const [left, right] = [DateRange.parse(a), DateRange.parse(b)];
  const point = (value) =>
    value === 'present' ? 'present' : `${value?.year}-${value?.month ?? ''}`;
  return Boolean(
    left &&
    right &&
    point(left.start) === point(right.start) &&
    point(left.end) === point(right.end)
  );
}

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
   * @param {string} [tailoring.language] - The language the tailoring is written in; another than `en` is a translation
   *   of the English source (#299)
   * @param {{ salaryExpectation?: string, startDate?: string, note?: string }} [tailoring.defaults] - What the letter
   *   was told, which it may state beside what the source does
   * @returns {{ path: string, reason: string }[]} Every failure, in the order of the profile; none when it holds
   */
  static failures({
    source,
    tailored,
    sources = {},
    terms = [],
    advert = '',
    language = 'en',
    defaults = {}
  }) {
    const shape = ProfileShape.problems(tailored);
    if (shape.length)
      return shape.map(({ path, reason }) => ({ path, reason: `${reason} (the profile's shape)` }));

    const found = [];
    const fail = (path, reason) => found.push({ path, reason });
    const whole = textOf(source);
    const translated = language !== 'en';
    const advertEnglish = AdvertLexicon.languageOf(advert)?.language === 'en';
    // Its plain words open its bullets too — "Across teams", "Strong Swift" — and are no names (the review of #286).
    // A German advert capitalises its nouns, so its capitals name nothing.
    const advertNames = new Set(
      (advertEnglish || !translated ? ProvenanceCheck.names(advert, { openers: true }) : [])
        .filter((word) => !AdvertLexicon.isStopword(word) && !AdvertLexicon.isPlainWord(word))
        .map(fold)
    );
    const reading = translated
      ? translatedReading(new Set([...ProvenanceCheck.names(whole).map(fold), ...advertNames]))
      : ENGLISH;
    // A translation writes the advert's plain words in its own language, so only the words a technology writes itself
    // with are held from the advert there; in English, every word the advert writes and the source never does.
    // A stopword or a plain word the tailoring was shown as a term is the check's to let pass, as it is among the
    // advert's words (the second review of #315); a skill the full CV lists is held whatever it is called.
    const shown = terms.filter(
      (term) => !AdvertLexicon.isStopword(term) && !AdvertLexicon.isPlainWord(term)
    );
    const vocabulary = [
      // A German advert capitalises its nouns, so there a term is a technology only when it looks like one; an English
      // advert's terms are held whatever their case. What a German advert names in a plain capital is #292's.
      ...(translated && !advertEnglish
        ? shown.filter((term) => /\p{Lu}.*\p{Lu}|\d|[+#/.]/u.test(term))
        : shown),
      ...(source.skills || []).flatMap((group) => (group.items || []).map((item) => item.name)),
      ...(translated ? [] : ProvenanceCheck.wordsOnlyIn(advert, whole))
    ].filter(Boolean);
    const states = (path, text, against, allowed) => {
      for (const reason of ProvenanceCheck.additions(text, against, {
        vocabulary,
        advertNames,
        reading,
        allowed
      })) {
        fail(path, reason);
      }
    };
    // A title a translation words its own way claims no more than its source: no seniority it does not write.
    const worded = (path, text, against) => {
      states(path, text, against);
      const claimed = new Set((String(against).match(SENIORITY) || []).map(fold));
      for (const word of new Set((String(text).match(SENIORITY) || []).map(fold))) {
        if (!claimed.has(word)) fail(path, `claims "${word}", which its source does not`);
      }
    };

    for (const key of translated ? COPIED : IDENTITY) {
      if (!same(tailored[key], source[key])) fail(key, "is the source's identity, and changed");
    }
    if (translated) {
      for (const key of WORDED) {
        if (Boolean(tailored[key]) !== Boolean(source[key])) {
          fail(key, "is the source's identity, and changed");
        } else if (tailored[key]) worded(key, tailored[key], source[key]);
      }
    }
    // A translation words a link's label its own way ("Web-Lebenslauf"); the address is the same address.
    const links = (list) => (list ?? []).map((link) => (translated ? { url: link?.url } : link));
    if (!same(links(tailored.social), links(source.social)))
      fail('social', "is the source's links, and changed");
    const titles = [source.title, ...(source.relevant_experience || []).map((role) => role.title)];
    if (translated && tailored.title !== undefined) {
      worded('title', tailored.title, titles.join('\n'));
    } else if (tailored.title !== undefined && !titles.includes(tailored.title)) {
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
      if (role.company !== origin.value.company) {
        fail(`${path}.company`, `is not ${origin.path}'s company`);
      }
      // A translation writes the months in its own language, and may word the title its own way; the dates are the
      // same dates, and the title claims nothing more (#299).
      if (
        translated
          ? !samePeriod(role.period, origin.value.period)
          : role.period !== origin.value.period
      ) {
        fail(`${path}.period`, `is not ${origin.path}'s period`);
      }
      if (translated) worded(`${path}.title`, role.title, origin.value.title);
      else if (role.title !== origin.value.title) {
        fail(`${path}.title`, `is not ${origin.path}'s title`);
      }
      if (role.location !== undefined) {
        if (translated) states(`${path}.location`, role.location, origin.value.location ?? '');
        else if (role.location !== origin.value.location) {
          fail(`${path}.location`, `is not ${origin.path}'s location`);
        }
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
        if (listedSkills.has(fold(item.name))) return;
        // A translation may word a plain skill in its own language; it names nothing the source does not.
        if (translated) states(`skills[${index}].items[${at}]`, item.name, whole);
        else
          fail(`skills[${index}].items[${at}]`, `"${item.name}" is not a skill the source lists`);
      });
    });
    // In English an entry is one the source lists, as it lists it. A translation words a degree or a language its own
    // way, so each names its source entry, whose names, dates and figures it keeps (#299).
    const ENTRIES = [
      ['education', 'degree', ['school', 'credits'], ['period'], ['degree', 'description']],
      ['certifications', 'certification', ['issuer', 'year', 'url'], [], ['name', 'description']],
      ['languages', 'language', [], [], ['name', 'level']]
    ];
    for (const [key, what, kept, dated, wordedFields] of ENTRIES) {
      (tailored[key] || []).forEach((entry, index) => {
        const path = `${key}[${index}]`;
        if (!translated) {
          if (!(source[key] || []).some((candidate) => same(entry, candidate))) {
            fail(path, `is not a ${what} the source lists, as it lists it`);
          }
          return;
        }
        const [origin] =
          ProvenanceCheck.sourcesOf(sources, path, source, fail, {
            one: true,
            kind: new RegExp(`^${key}\\[\\d+\\]$`),
            what: `a ${what}`
          }) || [];
        if (!origin) return;
        for (const field of kept) {
          if (!same(entry[field], origin.value[field])) {
            fail(`${path}.${field}`, `is not ${origin.path}'s ${field}`);
          }
        }
        for (const field of dated) {
          if (
            Boolean(entry[field]) !== Boolean(origin.value[field]) ||
            (entry[field] && !samePeriod(entry[field], origin.value[field]))
          ) {
            fail(`${path}.${field}`, `is not ${origin.path}'s ${field}`);
          }
        }
        for (const field of wordedFields) {
          if (entry[field]) states(`${path}.${field}`, entry[field], textOf(origin.value));
        }
      });
    }
    (tailored.interests || []).forEach((interest, index) => {
      if (translated) states(`interests[${index}]`, interest, (source.interests || []).join('\n'));
      else if (!(source.interests || []).includes(interest)) {
        fail(`interests[${index}]`, 'is not an interest the source lists');
      }
    });

    if (tailored.letter) {
      for (const failure of ProvenanceCheck.letterFailures({
        letter: tailored.letter,
        source,
        advert,
        defaults,
        states: (path, text, against, allowed) => states(`letter.${path}`, text, against, allowed)
      })) {
        fail(`letter.${failure.path}`, failure.reason);
      }
    }

    for (const { field, said, why } of driftingSpans(tailored)) {
      fail(field, `"${said}": ${why}`);
    }
    return found;
  }

  /**
   * Whether a tailored letter says only what the full CV, the advert and its defaults say (#299).
   *
   * Who it is addressed to is the advert's: its company, contact, role, address, reference and the position applied for
   * appear there, and it
   * takes a form of address only when the advert writes one before the contact's name — never from a first name
   * (#174). What it argues is the full CV's: its figures are the source's, or the salary and the start the defaults
   * give; its names are the source's or the advert's. Its date and signature are the job's, not the model's.
   * @param {object} letter - What the letter check reads
   * @param {object} letter.letter - The tailored letter
   * @param {object} letter.source - The full CV
   * @param {string} letter.advert - The advert
   * @param {{ salaryExpectation?: string, startDate?: string, note?: string }} letter.defaults - What it was told
   * @param {(path: string, text: string, against: string, allowed: string[]) => void} letter.states - Holds a text to
   *   what backs it, and the phrases it may write whole
   * @returns {{ path: string, reason: string }[]} What the letter says that nothing backs
   */
  static letterFailures({ letter, source, advert, defaults = {}, states }) {
    const found = [];
    const recipient =
      letter.recipient && typeof letter.recipient === 'object' ? letter.recipient : {};
    // A dot is punctuation the advert may or may not write: "Dr." and "Dr" are one title (the review of #300).
    const bare = (text) => fold(text).replace(/\.(?=\s|$)/g, '');
    const inAdvert = (text) => AdvertMatcher.contains(bare(advert), bare(text));
    for (const field of ['company', 'name', 'surname', 'title', 'role']) {
      const value = recipient[field];
      if (typeof value === 'string' && value.trim() && !inAdvert(value)) {
        found.push({ path: `recipient.${field}`, reason: `"${value}" is not in the advert` });
      }
    }
    (Array.isArray(recipient.address) ? recipient.address : []).forEach((line, index) => {
      if (typeof line === 'string' && line.trim() && !inAdvert(line)) {
        found.push({
          path: `recipient.address[${index}]`,
          reason: `"${line}" is not in the advert`
        });
      }
    });
    // The role applied for is named as the advert names it, and only there (the review of #300).
    for (const field of ['reference', 'position']) {
      const value = letter[field];
      if (typeof value === 'string' && value.trim() && !inAdvert(value)) {
        found.push({ path: field, reason: `"${value}" is not in the advert` });
      }
    }
    const form = String(recipient.form ?? '').toLowerCase();
    if (form === 'ms' || form === 'mr') {
      const surname = bare(
        recipient.surname ||
          String(recipient.name ?? '')
            .split(/\s+/)
            .at(-1) ||
          ''
      );
      // "Frau Dr. Grace Hopper", "Herrn Karl-Heinz Müller", "Herr John von Neumann", "MS GRACE HOPPER": the form, a title or
      // two, up to three given names and particles, then the surname — read case and accents aside. A given name is
      // no form and no conjunction: "Frau Müller und Herr Hopper" writes no "Frau" before Hopper (the review of #300).
      const words = form === 'ms' ? 'frau|ms|mrs' : 'herrn?|mr';
      const given = `(?:(?!(?:frau|ms|mrs|miss|herrn?|mr|und|and|oder|or|sowie)(?![\\p{L}]))\\p{L}+(?:-\\p{L}+)*\\s+)`;
      const written = new RegExp(
        `(?<![\\p{L}])(?:${words})\\s+(?:(?:dr|prof)\\s+)*${given}{0,3}${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`,
        'u'
      );
      if (!surname || !written.test(bare(advert))) {
        found.push({
          path: 'recipient.form',
          reason: `is "${form}", which the advert does not write before the contact's name: the neutral form, unless it does`
        });
      }
    }
    // The page greets the recipient from `recipient` and signs off itself, in the catalogue's words: a salutation or a
    // valediction the model writes is printed twice, and a form of address it writes there escapes the rule above.
    // A greeting is a greeting followed by whom it greets — a form of address, a title, a name — or by its comma or the
    // line's end; "Hi-fi audio", "Lieber als …" open prose. A closing stands as its own sentence, with at most the
    // name it signs; "Sincerely, I believe …" goes on (#312).
    const GREETING =
      /^\s*(?:dear|hello|hi|sehr geehrte[rn]?|liebe[rn]?|hallo|guten tag)(?![\p{L}-])/iu;
    const WHOM =
      /^(?:\s*,|\s*$|\s+(?:\p{Lu}|(?:frau|herrn?|ms|mrs|mr|dr|prof|hiring|team|sir|madam|all|everyone|recruiters?|colleagues|zusammen|damen|kolleg\p{L}*)(?![\p{L}])))/u;
    const SALUTATION = {
      test: (text) => {
        if (/^\s*to whom it may concern(?![\p{L}])/iu.test(text)) return true;
        const greeting = GREETING.exec(text);
        return Boolean(greeting) && WHOM.test(text.slice(greeting[0].length));
      }
    };
    const CLOSING =
      /^\s*(?:(?:kind|best|warm|warmest)\s+regards|yours\s+(?:sincerely|faithfully)|sincerely|mit freundlichen grüßen|viele grüße|beste grüße|herzliche grüße)(?![\p{L}])/iu;
    const SIGNED = /^\s*,?(?:\s+\p{Lu}[\p{L}.'’-]*){0,3}\s*[.!]?\s*$/u;
    const VALEDICTION = {
      test: (sentence) => {
        const closing = CLOSING.exec(sentence);
        return Boolean(closing) && SIGNED.test(sentence.slice(closing[0].length));
      }
    };
    // Read in every paragraph, and a valediction at any sentence of the letter's end: "… from you. Kind regards" prints
    // twice as surely as "Kind regards" does (the review of #300).
    const body = Array.isArray(letter.body) ? letter.body : [letter.body];
    const paragraphs = [
      ['opening', letter.opening],
      ...body.map((text, index) => [Array.isArray(letter.body) ? `body[${index}]` : 'body', text]),
      ['closing', letter.closing]
    ].filter(([, text]) => typeof text === 'string');
    for (const [path, text] of paragraphs) {
      if (SALUTATION.test(text)) {
        found.push({
          path,
          reason:
            'is a salutation: the page greets the recipient from `recipient`, in its own words'
        });
      }
    }
    const end = paragraphs.filter(([path]) => path !== 'opening').slice(-2);
    for (const [path, text] of end) {
      if (text.split(/(?<=[.!?])\s+|\n+/).some((sentence) => VALEDICTION.test(sentence))) {
        found.push({
          path,
          reason: 'is a valediction: the page signs off itself, in its own words'
        });
      }
    }
    // A letter says something: its subject, its opening paragraph and a body (the review of #300).
    for (const field of new CoverLetter(letter).missing) {
      if (['subject', 'opening', 'body'].includes(field)) {
        found.push({ path: field, reason: 'is missing' });
      }
    }
    // The advert names the letter's names — its advertiser, contact, role, city — but backs none of its claims: its
    // technologies and figures are held to the full CV, and to the salary and the start the defaults give.
    const told = [
      defaults.salaryExpectation,
      ...startWords(defaults.startDate),
      defaults.note,
      letter.reference
    ]
      .filter(Boolean)
      .join('\n');
    const against = [textOf(source), told].join('\n');
    // Only the addressee's own phrases, written whole: the advert's other words are its claims, not the candidate's, and
    // a contact titled "Flutter Lead" frees "Flutter Lead", never "Flutter" (the review of #300).
    const address = Array.isArray(recipient.address) ? recipient.address : [];
    const allowed = [
      recipient.company,
      unincorporated(recipient.company),
      recipient.name,
      recipient.surname,
      recipient.title,
      recipient.role,
      ...address,
      ...address.map(city),
      letter.reference,
      letter.position
    ]
      .filter(
        (value, index, all) =>
          typeof value === 'string' &&
          value.trim() &&
          inAdvert(value) &&
          all.indexOf(value) === index
      )
      // The longest first: "SAP" must not take its word out of "SAP Fiori Developer" before the role is read whole.
      .sort((a, b) => b.length - a.length);
    for (const field of ['subject', 'opening', 'closing']) {
      if (typeof letter[field] === 'string' && letter[field].trim())
        states(field, letter[field], against, allowed);
    }
    for (const field of ['body', 'attachments']) {
      const parts = Array.isArray(letter[field]) ? letter[field] : [letter[field]];
      parts.forEach((part, index) => {
        if (typeof part === 'string' && part.trim()) {
          states(
            Array.isArray(letter[field]) ? `${field}[${index}]` : field,
            part,
            against,
            allowed
          );
        }
      });
    }
    return found;
  }

  /**
   * What a tailored text states that its source does not: a figure, a name, or a term of the vocabulary.
   * @param {string} original - The tailored text
   * @param {string} against - Everything its sources say
   * @param {{ vocabulary?: string[], advertNames?: Set<string>, allowed?: string[] }} [words] - Terms that must not
   *   appear without a source, the names the advert writes, folded, and the phrases the text may write whole
   * @returns {string[]} A reason for each addition
   */
  static additions(
    original,
    against,
    { vocabulary = [], advertNames = new Set(), reading = ENGLISH, allowed = [] } = {}
  ) {
    // An allowed phrase is taken out as a dash, which says the sentence goes on: a capital after it is still a name
    // (the third review of #300).
    const text = allowed.reduce(
      (rest, phrase) => rest.replace(wholePhrase(phrase), ' – '),
      original
    );
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
      candidates(name, reading.part)
        .flatMap((candidate) => [candidate, reading.also(candidate)])
        .filter(Boolean)
        .some((candidate) => AdvertMatcher.appears(candidate, against) !== null);
    const names = [...new Set(reading.names(text))].filter((name) => !sourced(name));
    for (const name of names) reasons.push(`names "${name}", which its source does not`);
    const openers = [...new Set(reading.openers(text))].filter(
      (word) => advertNames.has(fold(word)) && !sourced(word)
    );
    for (const word of openers) reasons.push(`names "${word}", which its source does not`);

    // A term whose words were named above is one addition, already said.
    const said = new Set(
      [...names, ...openers].flatMap((name) =>
        candidates(name, reading.part).flatMap((part) => fold(part).split(' '))
      )
    );
    // One term however the advert capitalised it: "performance" and "Performance" are one addition (the third review of
    // #315).
    const terms = new Map();
    for (const term of vocabulary) if (!terms.has(fold(term))) terms.set(fold(term), term);
    for (const term of terms.values()) {
      const termWords = fold(term).split(' ');
      if (termWords.some((word) => said.has(word))) continue;
      if (AdvertLexicon.isDimension(term) && measured(term, text)) continue;
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
      // English capitalises its first person too: "I" is no name, in a letter above all (#299).
      if (/^I(?:['’](?:m|ve|d|ll))?$/.test(word)) continue;
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
            (word) =>
              word.length >= 3 &&
              /\p{L}/u.test(word) &&
              !AdvertLexicon.isStopword(word) &&
              !AdvertLexicon.isPlainWord(word)
          )
          // Found as written, or as the table spells it: "engineers" where the source writes "developers" (#296).
          .filter(
            (word) =>
              !AdvertLexicon.formsOf(word).some((form) => AdvertMatcher.contains(folded, form))
          )
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

/**
 * Whether a text names a dimension in a clause that states a figure after it: "test performance from 37.7 to 5.2 minutes" says
 * what the figure measures, and the figure is held to the source; "improved app performance" is a claim of its own
 * (#296, the review of #315). A full stop before a digit is a decimal point, and a colon introduces the measure.
 */
function measured(dimension, text) {
  // Case aside, and read as written: a folded "zwölf" is no figure (the third review of #315).
  const at = new RegExp(
    `(?<![\\p{L}\\p{N}])${dimension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`,
    'iu'
  );
  return text.split(/[,;!?]|\.(?!\d)/).some((clause) => {
    // The figure it measures follows it: "every two weeks for stability" names a figure of something else (the second
    // review of #315).
    const where = clause.search(at);
    return where >= 0 && figuresOf(clause.slice(where)).length > 0;
  });
}

/** What a name may be found in its source as: itself, without a possessive, or the parts of it that are names. */
function candidates(name, isName = ENGLISH.part) {
  const stem = name.replace(/['’]s$/, '');
  const parts = stem.split('-').filter((part) => isName(part));
  const compound = stem.includes('-') && parts.length ? [parts.join(' ')] : [];
  return [...new Set([name, stem, ...compound])];
}

/** A phrase wherever a text writes it whole, case and spacing aside. */
function wholePhrase(phrase) {
  const pattern = phrase
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu');
}

/** A company as a letter writes it in its prose: "Engine Works" for "Engine Works GmbH". */
function unincorporated(company) {
  if (typeof company !== 'string') return null;
  const name = company.replace(LEGAL_FORM, '').trim();
  return name && name !== company.trim() ? name : null;
}

/**
 * The city an address line ends in after its postcode: "Berlin" in "10115 Berlin", "Wien" in "A-1010 Wien". A German,
 * Austrian or Swiss address is the jurisdiction's; a US or UK one names its city on a line the letter writes whole.
 */
function city(line) {
  return typeof line === 'string'
    ? (/^\s*(?:[A-Z]{1,3}-)?\d{4,5}\s+(\p{L}.*)$/u.exec(line)?.[1] ?? null)
    : null;
}

/**
 * The ways a letter may write the start the defaults give: "2026-12-01" is also the year, the month and the day as
 * figures, and the month by name in English or German — "1 December 2026", "1. Dezember 2026" (the review of #300).
 */
function startWords(date) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(date ?? ''));
  if (!match) return date ? [date] : [];
  const [, year, month, day] = match;
  const names = Object.values(MONTHS).flatMap((language) =>
    Object.entries(language)
      .filter(([, number]) => number === Number(month))
      .map(([name]) => name)
  );
  const numeric = day
    ? [
        `${day}.${month}.${year}`,
        `${Number(day)}.${Number(month)}.${year}`,
        `${day}/${month}/${year}`
      ]
    : [`${month}/${year}`, `${Number(month)}/${year}`];
  return [
    date,
    year,
    String(Number(month)),
    ...(day ? [String(Number(day))] : []),
    ...numeric,
    ...names
  ];
}

/** A text's figures, each as written and as a value: numerals with their separators read, and number words. */
function figuresOf(text) {
  const value = String(text ?? '');
  const numerals = (value.match(FIGURE) || []).map((written) => {
    const suffix = /[kKM]$/.test(written) ? written.at(-1) : '';
    // "01" and "1" are one figure: a date's day and month are written with and without the zero.
    const number = (suffix ? written.slice(0, -1) : written)
      .replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1')
      .replace(',', '.')
      .replace(/^0+(?=\d)/, '');
    const scale = { k: 1e3, K: 1e3, M: 1e6 }[suffix] ?? 1;
    return { written, value: scale === 1 ? number : String(Number(number) * scale) };
  });
  const spelled = [...value.matchAll(NUMBER_WORD)].map((match) => ({
    written: match[0],
    value: String(
      match[3] !== undefined
        ? SPELLED[match[3].toLowerCase()]
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

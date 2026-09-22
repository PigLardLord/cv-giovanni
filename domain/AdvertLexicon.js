import { fold } from './fold.js';

/**
 * What a job advert says that is not about the job.
 *
 * The same shape as `SectionLexicon` and `MONTHS`: a map from purpose to per-language lists,
 * so adding a language is adding entries and nothing else changes.
 *
 * The honest difference from the section lexicon, and it belongs in the module rather than in
 * a ticket: **there is no catalogue to check coverage against.** An advert's vocabulary is not
 * ours, so no test can discover the words we are missing. What a test can assert is the shape,
 * and that a known advert in each language yields terms a person would agree with. Everything
 * below is therefore a floor, not a guarantee, and the report says so.
 */
export const ADVERT = {
  /** Words that carry no information about a role, however often they appear. */
  stopwords: {
    en: [
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'of',
      'to',
      'in',
      'on',
      'at',
      'for',
      'with',
      'from',
      'by',
      'as',
      'is',
      'are',
      'be',
      'been',
      'being',
      'will',
      'would',
      'can',
      'could',
      'should',
      'have',
      'has',
      'had',
      'you',
      'your',
      'we',
      'our',
      'us',
      'they',
      'their',
      'it',
      'its',
      'this',
      'that',
      'these',
      'those',
      'who',
      'what',
      'which',
      'how',
      'when',
      'where',
      'not',
      'no',
      'all',
      'any',
      'more',
      'most',
      'other',
      'some',
      'such',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'also',
      'about',
      'into',
      'over',
      'across',
      'while',
      'role',
      'team',
      'work',
      'working',
      'job',
      'position',
      'company',
      'years',
      'year',
      'experience',
      'strong',
      'good',
      'great',
      'excellent',
      'ability',
      'skills',
      'help',
      // Verbs and nouns every software advert uses and none of them means anything on their
      // own: they outrank the technologies unless they are named here.
      'build',
      'building',
      'maintain',
      'maintaining',
      'design',
      'designing',
      'create',
      'develop',
      'developing',
      'support',
      'provide',
      'ensure',
      'using',
      'include',
      'including',
      'apps',
      'application',
      'applications',
      'software',
      'systems',
      'product',
      'products',
      'high',
      'solid',
      'hands-on',
      'closely',
      // Function words, and the plain verbs and nouns of every advert's prose: a tailoring rewords into them, and they
      // name no technology and no claim (#296). One that begins or ends a technology's name — "New Relic", "time
      // series", "use cases" — is a plain word instead, below: a stopword takes the whole phrase out of the ranking.
      'through',
      'onto',
      'within',
      'them',
      'then',
      'there',
      'here',
      'before',
      'under',
      'between',
      'among',
      'via',
      'per',
      'like',
      'able',
      'made',
      'take',
      'used',
      'usage',
      'part',
      'both',
      'each',
      'well',
      'plus',
      'day',
      'days',
      'week',
      'weeks',
      'month',
      'months',
      'must',
      'need',
      'needs',
      'ideal',
      'understanding',
      'familiarity',
      'exposure',
      'improve',
      'deliver',
      'ship',
      'collaborate',
      'integrate',
      'integrating',
      'optimize',
      'optimise'
    ],
    de: [
      'der',
      'die',
      'das',
      'den',
      'dem',
      'des',
      'ein',
      'eine',
      'einen',
      'einem',
      'einer',
      'und',
      'oder',
      'aber',
      'von',
      'zu',
      'in',
      'im',
      'an',
      'am',
      'auf',
      'für',
      'mit',
      'aus',
      'bei',
      'als',
      'ist',
      'sind',
      'sein',
      'wird',
      'werden',
      'kann',
      'können',
      'soll',
      'sollen',
      'haben',
      'hat',
      'du',
      'dein',
      'deine',
      'sie',
      'ihr',
      'ihre',
      'wir',
      'unser',
      'unsere',
      'uns',
      'es',
      'dies',
      'diese',
      'dieser',
      'wer',
      'was',
      'wie',
      'wann',
      'wo',
      'nicht',
      'kein',
      'alle',
      'mehr',
      'auch',
      'sehr',
      'nur',
      'schon',
      'über',
      'durch',
      'nach',
      'rolle',
      'team',
      'arbeit',
      'stelle',
      'position',
      'unternehmen',
      'jahre',
      'jahren',
      'erfahrung',
      'kenntnisse',
      'fähigkeiten',
      'entwickeln',
      'entwicklung',
      'erstellen',
      'pflegen',
      'unterstützen',
      'anwendung',
      'anwendungen',
      'software',
      'systeme',
      'produkt'
    ],
    it: [
      'il',
      'lo',
      'la',
      'i',
      'gli',
      'le',
      'un',
      'uno',
      'una',
      'e',
      'ed',
      'o',
      'ma',
      'di',
      'del',
      'della',
      'dei',
      'delle',
      'a',
      'al',
      'alla',
      'ai',
      'in',
      'nel',
      'nella',
      'su',
      'per',
      'con',
      'da',
      'dal',
      'come',
      'è',
      'sono',
      'essere',
      'sarà',
      'saranno',
      'può',
      'possono',
      'deve',
      'devono',
      'avere',
      'ha',
      'tu',
      'tuo',
      'tua',
      'lei',
      'noi',
      'nostro',
      'nostra',
      'ci',
      'questo',
      'questa',
      'chi',
      'che',
      'cosa',
      'come',
      'quando',
      'dove',
      'non',
      'nessun',
      'tutti',
      'più',
      'anche',
      'molto',
      'solo',
      'già',
      'ruolo',
      'team',
      'lavoro',
      'posizione',
      'azienda',
      'anni',
      'esperienza',
      'competenze',
      'capacità',
      'sviluppare',
      'sviluppo',
      'creare',
      'mantenere',
      'supportare',
      'applicazione',
      'applicazioni',
      'software',
      'sistemi',
      'prodotto'
    ]
  },

  /**
   * The furniture of a job posting: legal notices, benefits, calls to apply.
   * Ranked highly by frequency and worth nothing, which is why they are named rather than
   * filtered by a threshold.
   */
  boilerplate: {
    en: [
      'equal opportunity',
      'equal opportunities',
      'regardless of',
      'we offer',
      'what we offer',
      'benefits',
      'perks',
      'apply now',
      'send your cv',
      'full time',
      'full-time',
      'part time',
      'part-time',
      'permanent',
      'permanent position',
      'permanent contract',
      'competitive salary',
      'about us',
      'join us',
      'our mission',
      'diverse',
      'inclusive',
      'diverse team',
      'inclusive team',
      'diverse and inclusive',
      'inclusive workplace',
      'flexible hours',
      'remote friendly'
    ],
    de: [
      'chancengleichheit',
      'unabhängig von',
      'wir bieten',
      'was wir bieten',
      'benefits',
      'jetzt bewerben',
      'bewerbung',
      'bewerbungsunterlagen',
      'bewerbungsprozess',
      'ihre bewerbung',
      'deine bewerbung',
      'ihre bewerbungsunterlagen',
      'deine bewerbungsunterlagen',
      'vollzeit',
      'teilzeit',
      'unbefristet',
      'befristet',
      'über uns',
      'unsere mission',
      'deine aufgaben',
      'ihre aufgaben',
      'attraktive vergütung',
      'flexible arbeitszeiten'
    ],
    it: [
      'l. 68/99',
      'pari opportunità',
      'indipendentemente da',
      'offriamo',
      'offriamo un',
      'offriamo una',
      'ti offriamo',
      'vi offriamo',
      'cosa offriamo',
      'benefit',
      'candidati ora',
      'invia il tuo cv',
      'tempo pieno',
      'part time',
      'indeterminato',
      'determinato',
      'tempo determinato',
      'tempo indeterminato',
      'chi siamo',
      'la nostra missione',
      'le tue mansioni',
      'sede di lavoro',
      'retribuzione commisurata',
      'orario flessibile'
    ]
  },

  /** Headings under which an advert states what it will not compromise on. */
  requirementHeadings: {
    en: [
      'requirements',
      'required',
      'must have',
      'essential',
      'qualifications',
      'you have',
      'what you bring',
      'who you are',
      'ideal experiences',
      'we are looking for'
    ],
    de: [
      'anforderungen',
      'voraussetzungen',
      'qualifikationen',
      'ihr profil',
      'dein profil',
      'das bringen sie mit',
      'das bringst du mit',
      'wen wir suchen',
      'must-have'
    ],
    it: [
      'requisiti',
      'requisiti richiesti',
      'qualifiche',
      'il tuo profilo',
      'chi cerchiamo',
      'cosa richiediamo',
      'competenze richieste'
    ]
  },

  /**
   * Headings that organise an advert without demanding or offering anything. Their own words
   * are structure, not requirements: `Tech Stack` is not a technology.
   */
  structuralHeadings: {
    en: [
      'role',
      'the role',
      'about the role',
      'focus',
      'responsibilities',
      'outcomes',
      'tech stack',
      'our stack',
      'how we work',
      'interview process',
      'the team',
      'location'
    ],
    de: [
      'die rolle',
      'aufgaben',
      'schwerpunkte',
      'technologien',
      'unser stack',
      'so arbeiten wir',
      'bewerbungsprozess',
      'das team',
      'standort'
    ],
    it: [
      'il ruolo',
      'mansioni',
      'responsabilità',
      'tecnologie',
      'il nostro stack',
      'come lavoriamo',
      'processo di selezione',
      'il team',
      'sede'
    ]
  },

  /** Headings under which an advert talks about itself. Terms below these are worth less. */
  offerHeadings: {
    en: [
      'we offer',
      'what we offer',
      'benefits',
      'perks',
      'about us',
      'why join',
      'our culture',
      'how we work'
    ],
    de: ['wir bieten', 'was wir bieten', 'benefits', 'über uns', 'unsere kultur', 'warum wir'],
    it: ['offriamo', 'cosa offriamo', 'benefit', 'chi siamo', 'la nostra cultura', 'perché noi']
  },

  /**
   * Hand-curated, and short on purpose.
   *
   * A general synonym engine, a stemmer or embeddings would each need a dependency, and each
   * would make the matcher's mistakes harder to see. A match through this table is reported as
   * `synonym`, never as `exact`, so a reader can tell which rung a term arrived on.
   */
  // A German advert names what an English full CV evidences in German words: "Testautomatisierung" is test automation
  // (#306). The German forms stand beside the English in the same group, so evidence is found across the two, and a
  // match through them is reported as `synonym`, as any other. Whole words only: a compound built on one with a
  // linking "s" — "Testautomatisierungs-Framework", "Barrierefreiheitsprüfung" — is out of reach, as is any compound
  // the table does not list.
  synonyms: [
    ['mdm', 'mobile device management', 'mobilgeräteverwaltung'],
    [
      'ci/cd',
      'continuous integration',
      'continuous delivery',
      'continuous deployment',
      'kontinuierliche integration'
    ],
    ['ml', 'machine learning', 'maschinelles lernen'],
    ['ui', 'user interface', 'benutzeroberfläche'],
    ['ux', 'user experience', 'nutzererlebnis', 'benutzererfahrung'],
    ['qa', 'quality assurance', 'qualitätssicherung'],
    ['spm', 'swift package manager'],
    ['tdd', 'test driven development', 'test-driven development', 'testgetriebene entwicklung'],
    // Not the bare singular: "die Schnittstelle zwischen Produkt und Entwicklung" is a liaison, not an API.
    [
      'api',
      'apis',
      'schnittstellen',
      'rest-schnittstelle',
      'rest-schnittstellen',
      'programmierschnittstelle',
      'programmierschnittstellen'
    ],
    ['ios', 'apple platform', 'apple platforms'],
    ['developer', 'developers', 'engineer', 'engineers', 'entwickler', 'entwicklerin'],
    [
      'test automation',
      'automated testing',
      'automated tests',
      'testautomatisierung',
      'test-automatisierung',
      'automatisierte tests'
    ],
    ['accessibility', 'barrierefreiheit', 'a11y'],
    ['architecture', 'architektur', 'softwarearchitektur'],
    ['code review', 'code reviews', 'code-review', 'code-reviews'],
    ['unit tests', 'unit testing', 'unit-tests', 'unittests'],
    ['mobile development', 'mobile app development', 'app-entwicklung', 'mobile entwicklung']
  ],

  /**
   * The gender markers a job title carries in words: "(gn)", "(all genders)". The letters joined by slashes — "m/w/d",
   * "f/m/d/x", "m | w | d" — are one shape, read by the pattern below whatever their order. Each is read as a whole
   * token and taken out of its line, never matched inside a word — as boilerplate, "gn" dropped every line with
   * "design", "signal" or "align" in it — and never taken for the line, which is the advert's title (#314). A short
   * marker counts only in its brackets: "GN Audio" is an employer (the review of #329).
   */
  genderMarkers: {
    en: ['all genders', 'any gender'],
    de: ['gn', 'alle geschlechter', 'männlich/weiblich/divers'],
    it: ['uomo/donna', 'tutti i generi']
  },

  /**
   * Plain words the provenance check lets a tailoring write although the full CV does not, and the matcher still ranks:
   * each is a word of some technology's name — "New Relic", "Google Drive", "time series", "set up" — which a stopword
   * would take out of the ranking whole (the review of #315). Only the English check reads them; the other languages
   * carry theirs for the shape.
   */
  plainWords: {
    en: ['new', 'time', 'set', 'use', 'get', 'make', 'keep', 'drive', 'after', 'knowledge'],
    de: ['neu', 'neue', 'neuen', 'zeit', 'nutzen'],
    it: ['nuovo', 'nuova', 'tempo', 'conoscenza', 'conoscenze', 'usare']
  },

  /**
   * Nouns that name what a claim measures: a tailoring may write "test performance" beside the figure its source
   * measures the test runtime with, and the figure is still held to the source (#296). Beside no figure, "improved app
   * performance" is a claim, and refused like "scalable" or "reliable" (the review of #315). Still ranked as the
   * advert's terms.
   */
  dimensions: {
    en: ['performance', 'stability', 'quality', 'speed', 'efficiency'],
    de: ['performance', 'leistung', 'stabilität', 'qualität', 'geschwindigkeit', 'effizienz'],
    it: ['prestazioni', 'stabilità', 'qualità', 'velocità', 'efficienza']
  }
};

const set = (group) => new Set(Object.values(group).flat().map(fold));
const STOPWORDS = set(ADVERT.stopwords);
const DIMENSIONS = set(ADVERT.dimensions);
const PLAIN_WORDS = set(ADVERT.plainWords);
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Longest first, so "m/w/d" is not read as the start of something longer; bracketed or bare, but only whole.
// Letters of gender joined by slashes or bars, two to four of them: "m/w/d", "f/m/d/x", "m | w | d".
const SLASHED = String.raw`[mwfd](?:\s*[/|]\s*[mwfdxi]){1,3}`;
// The markers in words, lowercased as written — folding would strip the "ä" of "männlich" the line still carries.
const WORDED = Object.values(ADVERT.genderMarkers)
  .flat()
  .map((entry) => entry.toLowerCase())
  .sort((a, b) => b.length - a.length);
const whole = (pattern) => String.raw`(?<![\p{L}\p{N}/])(?:${pattern})(?![\p{L}\p{N}/])`;
// Bare, three letters or more: "m/f ratio" is a ratio.
const LONG = [
  String.raw`[mwfd](?:\s*[/|]\s*[mwfdxi]){2,3}`,
  ...WORDED.filter((entry) => entry.length >= 5).map(escaped)
].join('|');
const ANY = [SLASHED, ...WORDED.map(escaped)].join('|');
// Bracketed, any marker; bare, only one too long to be a word of its own.
const GENDER_MARKER = new RegExp(
  String.raw`\s*(?:[([]\s*${whole(ANY)}\s*[)\]]|${whole(LONG)})`,
  'giu'
);
// Each entry as whole words, never inside a word or before a hyphen: as substrings, "about us" swallowed "about
// users", "our mission" "our mission-critical app" and "bewerbung" "Bewerbungsmanagement-Software" (#335). An entry
// of one word — "diverse", "benefits", "determinato" — is an ordinary word too, and marks furniture only on a short
// line: "Vollzeit, unbefristet" is, "a diverse set of technologies" is not.
const wholeEntry = (entry) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])${entry.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\p{L}\\p{N}-])`,
    'u'
  );
const FURNITURE = Object.values(ADVERT.boilerplate).flat().map(fold);
const PHRASES = FURNITURE.filter((entry) => /\s/.test(entry)).map(wholeEntry);
const WORDS = FURNITURE.filter((entry) => !/\s/.test(entry)).map(wholeEntry);
/** How many words a line may hold and still be furniture when a word of it is. */
const SHORT = 3;
const REQUIREMENT = Object.values(ADVERT.requirementHeadings).flat().map(fold);
const OFFER = Object.values(ADVERT.offerHeadings).flat().map(fold);
const STRUCTURAL = Object.values(ADVERT.structuralHeadings).flat().map(fold);

/**
 * A form as it folds, and as a writer without the letter writes it: "Qualitätssicherung" folds to "qualitatssicherung",
 * and is also written "Qualitaetssicherung", which folding never reaches (#330).
 */
const spellings = (form) => [
  ...new Set([
    fold(form),
    fold(
      form
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae')
        .replace(/Ö/g, 'Oe')
        .replace(/Ü/g, 'Ue')
    )
  ])
];

const SYNONYM = new Map();
for (const group of ADVERT.synonyms) {
  const canonical = fold(group[0]);
  for (const form of group)
    for (const spelling of spellings(form)) SYNONYM.set(spelling, canonical);
}

export class AdvertLexicon {
  /** Every language the lexicon knows, discovered rather than declared. */
  static languages() {
    return [...new Set(Object.keys(ADVERT.stopwords))].sort();
  }

  /** A word that carries no information about the role, in any supported language. */
  static isStopword(word) {
    return STOPWORDS.has(fold(word));
  }

  /** A word of an advert's prose the provenance check lets pass, which the matcher still ranks: "new", "time". */
  static isPlainWord(word) {
    return PLAIN_WORDS.has(fold(word));
  }

  /** A noun that names what a claim measures, beside a figure: "performance", "stability". */
  static isDimension(word) {
    return DIMENSIONS.has(fold(word));
  }

  /**
   * A line without the gender markers its title carries: "Senior iOS Engineer (m/f/d)" is "Senior iOS Engineer".
   * @param {string} line - One line of the advert
   * @returns {string} The line, its markers taken out
   */
  static withoutGenderMarkers(line) {
    return String(line ?? '')
      .replace(GENDER_MARKER, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** A phrase that belongs to the posting rather than to the job. */
  static isBoilerplate(phrase) {
    const folded = fold(phrase);
    if (AdvertLexicon.isBoilerplatePhrase(folded)) return true;
    // A word of it counts on a short line — a slash between two words is no word (the review of #346) — or as the
    // label a line opens with: "Benefits: gym, lunch".
    const words = folded.split(/[^\p{L}\p{N}/.-]+/u).filter((word) => /[\p{L}\p{N}]/u.test(word));
    if (words.length <= SHORT && WORDS.some((entry) => entry.test(folded))) return true;
    return WORDS.some((entry) => new RegExp(`^\\s*${entry.source}\\s*:`, 'u').test(folded));
  }

  /**
   * Whether a phrase holds a phrase of posting furniture — "competitive salary", "wir bieten" — as the matcher asks of
   * each phrase it ranks. A lone word of the list is no furniture inside a phrase: "health benefits administration"
   * is a job (the review of #346).
   * @param {string} phrase - A phrase of the advert
   * @returns {boolean} Whether it holds one
   */
  static isBoilerplatePhrase(phrase) {
    const folded = fold(phrase);
    return PHRASES.some((entry) => entry.test(folded));
  }

  /**
   * What a line is, when it is a heading: what the advert demands, or what it offers.
   * @param {string} line - One line of the advert
   * @returns {'required'|'offer'|null} Which kind of heading, if any
   */
  static headingKind(line) {
    const folded = fold(line)
      .replace(/[:*#•\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!folded || folded.length > 60) return null;
    if (REQUIREMENT.some((entry) => folded === entry || folded.startsWith(entry)))
      return 'required';
    if (OFFER.some((entry) => folded === entry || folded.startsWith(entry))) return 'offer';
    if (STRUCTURAL.some((entry) => folded === entry)) return 'neutral';
    return null;
  }

  /** The canonical form of a term, when the table knows one. */
  static canonical(term) {
    return SYNONYM.get(fold(term)) || fold(term);
  }

  /** Every spelling the table knows for a term, its own included. */
  static formsOf(term) {
    const canonical = AdvertLexicon.canonical(term);
    const group = ADVERT.synonyms.find((entry) => fold(entry[0]) === canonical);
    return group ? group.flatMap(spellings) : [fold(term)];
  }

  /** Whether two terms mean the same thing through the table rather than by spelling. */
  static areSynonyms(a, b) {
    return fold(a) !== fold(b) && AdvertLexicon.canonical(a) === AdvertLexicon.canonical(b);
  }

  /**
   * Which language an advert is written in, by how many of its words are that language's
   * stopwords. Reported rather than acted on: a German advert against an English CV is a
   * finding, not something to correct silently.
   * @param {string} text - The advert
   * @returns {{language: string, confidence: number}|null} The best guess
   */
  static languageOf(text) {
    const words = fold(text)
      .split(/[^a-z0-9äöüß']+/)
      .filter(Boolean);
    if (words.length < 20) return null;

    const scores = Object.entries(ADVERT.stopwords)
      .map(([language, list]) => {
        const stops = new Set(list.map(fold));
        return {
          language,
          confidence: words.filter((word) => stops.has(word)).length / words.length
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    return scores[0].confidence > 0.05 ? scores[0] : null;
  }
}

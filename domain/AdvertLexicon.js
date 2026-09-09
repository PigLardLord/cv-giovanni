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
    en: ['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
      'from', 'by', 'as', 'is', 'are', 'be', 'been', 'being', 'will', 'would', 'can', 'could',
      'should', 'have', 'has', 'had', 'you', 'your', 'we', 'our', 'us', 'they', 'their', 'it',
      'its', 'this', 'that', 'these', 'those', 'who', 'what', 'which', 'how', 'when', 'where',
      'not', 'no', 'all', 'any', 'more', 'most', 'other', 'some', 'such', 'own', 'same', 'so',
      'than', 'too', 'very', 'just', 'also', 'about', 'into', 'over', 'across', 'while',
      'role', 'team', 'work', 'working', 'job', 'position', 'company', 'years', 'year',
      'experience', 'strong', 'good', 'great', 'excellent', 'ability', 'skills', 'help',
      // Verbs and nouns every software advert uses and none of them means anything on their
      // own: they outrank the technologies unless they are named here.
      'build', 'building', 'maintain', 'maintaining', 'design', 'designing', 'create',
      'develop', 'developing', 'support', 'provide', 'ensure', 'using', 'include',
      'including', 'apps', 'application', 'applications', 'software', 'systems', 'product',
      'products', 'high', 'solid', 'hands-on', 'closely', 'across'],
    de: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
      'und', 'oder', 'aber', 'von', 'zu', 'in', 'im', 'an', 'am', 'auf', 'für', 'mit', 'aus',
      'bei', 'als', 'ist', 'sind', 'sein', 'wird', 'werden', 'kann', 'können', 'soll', 'sollen',
      'haben', 'hat', 'du', 'dein', 'deine', 'sie', 'ihr', 'ihre', 'wir', 'unser', 'unsere',
      'uns', 'es', 'dies', 'diese', 'dieser', 'wer', 'was', 'wie', 'wann', 'wo', 'nicht',
      'kein', 'alle', 'mehr', 'auch', 'sehr', 'nur', 'schon', 'über', 'durch', 'nach',
      'rolle', 'team', 'arbeit', 'stelle', 'position', 'unternehmen', 'jahre', 'jahren',
      'erfahrung', 'kenntnisse', 'fähigkeiten', 'entwickeln', 'entwicklung', 'erstellen',
      'pflegen', 'unterstützen', 'anwendung', 'anwendungen', 'software', 'systeme', 'produkt'],
    it: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'e', 'ed', 'o', 'ma', 'di',
      'del', 'della', 'dei', 'delle', 'a', 'al', 'alla', 'ai', 'in', 'nel', 'nella', 'su',
      'per', 'con', 'da', 'dal', 'come', 'è', 'sono', 'essere', 'sarà', 'saranno', 'può',
      'possono', 'deve', 'devono', 'avere', 'ha', 'tu', 'tuo', 'tua', 'lei', 'noi', 'nostro',
      'nostra', 'ci', 'questo', 'questa', 'chi', 'che', 'cosa', 'come', 'quando', 'dove',
      'non', 'nessun', 'tutti', 'più', 'anche', 'molto', 'solo', 'già', 'ruolo', 'team',
      'lavoro', 'posizione', 'azienda', 'anni', 'esperienza', 'competenze', 'capacità',
      'sviluppare', 'sviluppo', 'creare', 'mantenere', 'supportare', 'applicazione',
      'applicazioni', 'software', 'sistemi', 'prodotto']
  },

  /**
   * The furniture of a job posting: legal notices, benefits, gender markers, calls to apply.
   * Ranked highly by frequency and worth nothing, which is why they are named rather than
   * filtered by a threshold.
   */
  boilerplate: {
    en: ['equal opportunity', 'equal opportunities', 'regardless of', 'we offer', 'what we offer',
      'benefits', 'perks', 'apply now', 'send your cv', 'full time', 'full-time', 'part time',
      'part-time', 'permanent', 'competitive salary', 'about us', 'join us', 'our mission',
      'diverse', 'inclusive', 'flexible hours', 'remote friendly'],
    de: ['m/w/d', 'w/m/d', 'm/w/x', 'gn', 'chancengleichheit', 'unabhängig von', 'wir bieten',
      'was wir bieten', 'benefits', 'jetzt bewerben', 'bewerbung', 'vollzeit', 'teilzeit',
      'unbefristet', 'befristet', 'über uns', 'unsere mission', 'deine aufgaben', 'ihre aufgaben',
      'attraktive vergütung', 'flexible arbeitszeiten'],
    it: ['l. 68/99', 'pari opportunità', 'indipendentemente da', 'offriamo', 'cosa offriamo',
      'benefit', 'candidati ora', 'invia il tuo cv', 'tempo pieno', 'part time', 'indeterminato',
      'determinato', 'chi siamo', 'la nostra missione', 'le tue mansioni', 'sede di lavoro',
      'retribuzione commisurata', 'orario flessibile']
  },

  /** Headings under which an advert states what it will not compromise on. */
  requirementHeadings: {
    en: ['requirements', 'required', 'must have', 'essential', 'qualifications', 'you have',
      'what you bring', 'who you are', 'ideal experiences', 'we are looking for'],
    de: ['anforderungen', 'voraussetzungen', 'qualifikationen', 'ihr profil', 'dein profil',
      'das bringen sie mit', 'das bringst du mit', 'wen wir suchen', 'must-have'],
    it: ['requisiti', 'requisiti richiesti', 'qualifiche', 'il tuo profilo', 'chi cerchiamo',
      'cosa richiediamo', 'competenze richieste']
  },

  /** Headings under which an advert talks about itself. Terms below these are worth less. */
  offerHeadings: {
    en: ['we offer', 'what we offer', 'benefits', 'perks', 'about us', 'why join', 'our culture',
      'how we work'],
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
  synonyms: [
    ['mdm', 'mobile device management'],
    ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
    ['ml', 'machine learning'],
    ['ui', 'user interface'],
    ['ux', 'user experience'],
    ['qa', 'quality assurance'],
    ['spm', 'swift package manager'],
    ['tdd', 'test driven development', 'test-driven development'],
    ['api', 'apis'],
    ['ios', 'apple platform', 'apple platforms']
  ]
};

const set = (group) => new Set(Object.values(group).flat().map(fold));
const STOPWORDS = set(ADVERT.stopwords);
const BOILERPLATE = Object.values(ADVERT.boilerplate).flat().map(fold);
const REQUIREMENT = Object.values(ADVERT.requirementHeadings).flat().map(fold);
const OFFER = Object.values(ADVERT.offerHeadings).flat().map(fold);

const SYNONYM = new Map();
for (const group of ADVERT.synonyms) {
  const canonical = fold(group[0]);
  for (const form of group) SYNONYM.set(fold(form), canonical);
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

  /** A phrase that belongs to the posting rather than to the job. */
  static isBoilerplate(phrase) {
    const folded = fold(phrase);
    return BOILERPLATE.some((entry) => folded === entry || folded.includes(entry));
  }

  /**
   * What a line is, when it is a heading: what the advert demands, or what it offers.
   * @param {string} line - One line of the advert
   * @returns {'required'|'offer'|null} Which kind of heading, if any
   */
  static headingKind(line) {
    const folded = fold(line).replace(/[:*#•\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!folded || folded.length > 60) return null;
    if (REQUIREMENT.some((entry) => folded === entry || folded.startsWith(entry))) return 'required';
    if (OFFER.some((entry) => folded === entry || folded.startsWith(entry))) return 'offer';
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
    return group ? group.map(fold) : [fold(term)];
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
    const words = fold(text).split(/[^a-z0-9äöüß']+/).filter(Boolean);
    if (words.length < 20) return null;

    const scores = Object.entries(ADVERT.stopwords).map(([language, list]) => {
      const stops = new Set(list.map(fold));
      return { language, confidence: words.filter((word) => stops.has(word)).length / words.length };
    }).sort((a, b) => b.confidence - a.confidence);

    return scores[0].confidence > 0.05 ? scores[0] : null;
  }
}

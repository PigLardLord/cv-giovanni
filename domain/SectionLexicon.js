import { fold } from './fold.js';

/**
 * What a CV calls its sections, per language.
 *
 * Adding a language is adding entries here. Nothing else changes — not the parser, not the
 * folding, not the tests, which discover the languages rather than listing them. German and
 * Italian are on the roadmap and more will follow, and a lexicon that needed code edited per
 * language would have made every one of them a small refactor.
 *
 * The canonical keys match `locales/<lang>/cv.json` `sections`, so the coverage test can
 * compare the two directly: a section renamed in the catalogue to something a stranger would
 * not recognise fails that test, which is the finding.
 */
export const SECTIONS = {
  profile: {
    en: ['Profile', 'Summary', 'Professional Summary', 'About', 'Objective'],
    de: ['Profil', 'Kurzprofil', 'Über mich', 'Zusammenfassung'],
    it: ['Profilo', 'Sommario', 'Chi sono', 'Presentazione']
  },
  selectedImpact: {
    en: ['Selected Impact', 'Key Achievements', 'Highlights', 'Impact'],
    de: ['Ausgewählte Erfolge', 'Erfolge', 'Höhepunkte'],
    it: ['Risultati principali', 'Risultati', 'Traguardi']
  },
  experience: {
    en: [
      'Experience',
      'Professional Experience',
      'Work Experience',
      'Employment History',
      'Career History',
      'Employment'
    ],
    de: [
      'Berufserfahrung',
      'Beruflicher Werdegang',
      'Werdegang',
      'Berufspraxis',
      'Praktische Erfahrung'
    ],
    it: [
      'Esperienza',
      'Esperienza professionale',
      'Esperienze lavorative',
      'Esperienza lavorativa',
      'Percorso professionale'
    ]
  },
  education: {
    en: ['Education', 'Academic Background', 'Qualifications', 'Academic Qualifications'],
    de: ['Ausbildung', 'Studium', 'Schulbildung', 'Akademischer Werdegang'],
    it: ['Istruzione', 'Formazione', 'Percorso di studi', 'Titoli di studio']
  },
  skills: {
    en: [
      'Skills',
      'Core Technologies',
      'Technical Skills',
      'Core Competencies',
      'Technologies',
      'Competencies',
      'Expertise'
    ],
    de: [
      'Kenntnisse',
      'Kernkompetenzen',
      'Fähigkeiten',
      'Kompetenzen',
      'EDV-Kenntnisse',
      'Technische Kenntnisse'
    ],
    it: [
      'Competenze',
      'Competenze tecniche',
      'Competenze chiave',
      'Tecnologie',
      'Conoscenze informatiche'
    ]
  },
  languages: {
    en: ['Languages', 'Language Skills'],
    de: ['Sprachen', 'Sprachkenntnisse'],
    it: ['Lingue', 'Conoscenze linguistiche']
  },
  certifications: {
    en: ['Certifications', 'Certificates', 'Licences', 'Licenses', 'Training'],
    de: ['Zertifizierungen', 'Zertifikate', 'Weiterbildung', 'Fortbildung'],
    it: ['Certificazioni', 'Certificati', 'Abilitazioni', 'Formazione continua']
  },
  interests: {
    en: ['Interests', 'Hobbies', 'Activities', 'Personal Interests'],
    de: ['Interessen', 'Hobbys', 'Freizeit', 'Persönliche Interessen'],
    it: ['Interessi', 'Hobby', 'Tempo libero', 'Interessi personali']
  }
};

/**
 * The word a role header joins its title to its employer with, per language: "Mobile Developer at Acme",
 * "Entwickler bei Acme", "Sviluppatore presso Acme". It is the page's own form (#147), and the
 * way a CV writes a role in running text.
 */
export const CONNECTORS = {
  en: ['at'],
  de: ['bei'],
  it: ['presso']
};

/** Folded heading → { section, language }, built once. */
const INDEX = new Map();
for (const [section, byLanguage] of Object.entries(SECTIONS)) {
  for (const [language, names] of Object.entries(byLanguage)) {
    for (const name of names) {
      if (!INDEX.has(fold(name))) INDEX.set(fold(name), { section, language });
    }
  }
}

/** A heading is short and does not end a sentence. Prose that happens to contain one is not one. */
const PLAUSIBLE_HEADING = /^[^.;:!?]{2,40}$/;

export class SectionLexicon {
  /**
   * Which section a line names, and in which language.
   *
   * Every language is recognised at once rather than one being chosen in advance: a CV that
   * is Italian with one English heading still segments, and the language each heading
   * matched is reported so that a **silently mixed** document becomes visible instead of
   * passing as monolingual. `AGENTS.md` forbids mixing languages in the routing; nothing has
   * ever checked it in the rendered artefact.
   * @param {string} line - One line of extracted text
   * @returns {{section: string, language: string, match: 'exact'|'partial'}|null} What it names
   */
  static recognise(line) {
    const folded = fold(line);
    if (!folded || !PLAUSIBLE_HEADING.test(folded)) return null;

    const exact = INDEX.get(folded);
    if (exact) return { ...exact, match: 'exact' };

    // A heading the layout truncated, or one carrying a stray glyph. Reported as `partial`
    // rather than accepted quietly: it means the document says something the lexicon only
    // half recognises, which is worth a reader's attention either way.
    for (const [name, where] of INDEX) {
      if (folded.startsWith(name) || name.startsWith(folded)) {
        return { ...where, match: 'partial' };
      }
    }
    return null;
  }

  /**
   * The section a label names when it opens a line and its block follows on the same line.
   *
   * A layout that sets its labels in a rail beside each block draws the label on the block's first
   * baseline, and read in content-stream order the two come out as one line: "Professional Experience
   * Mobile Software Engineer / …". That is the rail convention of pdfmake's output here and of the classic
   * Europass CV, not a guess. The label must be a section name exactly, and the word after it must carry a
   * capital or a digit, because a sentence that opens on a section word goes on in lower case: "Experience
   * with Swift", "Training for new hires". A capitalised word after one is still read as a label, so a
   * role header "Training Manager at …" would open a section; that fails a floor loudly rather than
   * passing quietly.
   * @param {string} line - One line of extracted text
   * @returns {{section: string, language: string, match: 'exact', label: string, rest: string}|null} The label
   */
  static label(line) {
    const words = String(line ?? '')
      .trim()
      .split(/\s+/);
    for (let count = Math.min(words.length - 1, 4); count >= 1; count -= 1) {
      const where = INDEX.get(fold(words.slice(0, count).join(' ')));
      if (where && /[\p{Lu}\d]/u.test(words[count])) {
        return {
          ...where,
          match: 'exact',
          label: words.slice(0, count).join(' '),
          rest: words.slice(count).join(' ')
        };
      }
    }
    return null;
  }

  /** Every connector the lexicon knows, in every language at once, as section names are. */
  static connectors() {
    return [...new Set(Object.values(CONNECTORS).flat())];
  }

  /** Every language the lexicon knows, discovered rather than declared. */
  static languages() {
    return [
      ...new Set(Object.values(SECTIONS).flatMap((byLanguage) => Object.keys(byLanguage)))
    ].sort();
  }

  /**
   * The languages a set of recognised headings was written in.
   *
   * More than one is a finding: a document whose sections are half English and half German
   * reads as a translation someone abandoned, and it is invisible on the page when each
   * heading is plausible on its own.
   * @param {Array<{language: string}>} recognised - Headings already recognised
   * @returns {string[]} Languages, sorted
   */
  static languagesUsed(recognised = []) {
    return [...new Set(recognised.map((entry) => entry.language))].sort();
  }
}

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
    en: ['Experience', 'Professional Experience', 'Work Experience', 'Employment History',
      'Career History', 'Employment'],
    de: ['Berufserfahrung', 'Beruflicher Werdegang', 'Werdegang', 'Berufspraxis',
      'Praktische Erfahrung'],
    it: ['Esperienza', 'Esperienza professionale', 'Esperienze lavorative',
      'Esperienza lavorativa', 'Percorso professionale']
  },
  education: {
    en: ['Education', 'Academic Background', 'Qualifications', 'Academic Qualifications'],
    de: ['Ausbildung', 'Studium', 'Schulbildung', 'Akademischer Werdegang'],
    it: ['Istruzione', 'Formazione', 'Percorso di studi', 'Titoli di studio']
  },
  skills: {
    en: ['Skills', 'Core Technologies', 'Technical Skills', 'Core Competencies',
      'Technologies', 'Competencies', 'Expertise'],
    de: ['Kenntnisse', 'Kernkompetenzen', 'Fähigkeiten', 'Kompetenzen', 'EDV-Kenntnisse',
      'Technische Kenntnisse'],
    it: ['Competenze', 'Competenze tecniche', 'Competenze chiave', 'Tecnologie',
      'Conoscenze informatiche']
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

  /** Every language the lexicon knows, discovered rather than declared. */
  static languages() {
    return [...new Set(Object.values(SECTIONS).flatMap((byLanguage) => Object.keys(byLanguage)))].sort();
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

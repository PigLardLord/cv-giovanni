import { AdvertLexicon } from '../domain/AdvertLexicon.js';
import { fold } from '../domain/fold.js';

/** Tokens that survive: `CI/CD`, `C++`, `.NET`, `Objective-C`, `Swift 6`. */
const TOKEN = /\.?[A-Za-z0-9][A-Za-z0-9+#./-]*/g;

/** A term that carries a capital inside it, a digit, or a symbol is probably a technology. */
const TECHNICAL = /[A-Z].*[A-Z]|[0-9]|[+#/.]/;

/**
 * What an advert asks for, and where the CV answers it.
 *
 * Two halves, and the second is the one worth having. Extracting terms is a frequency exercise
 * anyone can do. Placing them is the part that changes a decision: a term found in the prose of
 * a role is evidence, and the same term found only in a list of skills is a claim.
 *
 * Matching runs against what a parser **recovered**, never against the authored JSON. A term the
 * layout shredded counts as absent, which is the whole reason this sits downstream of the parser
 * rather than beside it.
 */
export class AdvertMatcher {
  /**
   * Rank what the advert asks for.
   *
   * The ranking is frequency, weighted by how specific a term looks and by which section of the
   * advert it came from. **It is not TF-IDF** — there is no corpus here to compute an inverse
   * document frequency against, and borrowing the name for a heuristic would be claiming a
   * precision it does not have.
   * @param {string} text - The advert
   * @param {number} [limit] - How many terms to keep
   * @returns {{terms: Array, language: Object|null}} Ranked terms
   */
  static extractTerms(text, limit = 30) {
    const lines = String(text ?? '').split(/\r?\n/);
    const counts = new Map();
    let section = null;

    for (const line of lines) {
      const heading = AdvertLexicon.headingKind(line);
      if (heading) {
        // A neutral heading organises the advert without demanding anything, so it does not
        // change what the terms under it are worth — but its own words are never terms.
        if (heading !== 'neutral') section = heading;
        continue;
      }
      if (!line.trim() || AdvertLexicon.isBoilerplate(line)) continue;

      const words = (line.match(TOKEN) || [])
        .map((word) => word.replace(/[.,;:]+$/, ''))
        .filter(Boolean);

      for (let size = 1; size <= 3; size += 1) {
        for (let start = 0; start + size <= words.length; start += 1) {
          const phrase = words.slice(start, start + size).join(' ');
          if (!AdvertMatcher.keeps(phrase, words.slice(start, start + size))) continue;
          const key = fold(phrase);
          const entry = counts.get(key) || { term: phrase, count: 0, required: false, size };
          entry.count += section === 'offer' ? 0.25 : 1;
          entry.required = entry.required || section === 'required';
          counts.set(key, entry);
        }
      }
    }

    const ranked = [...counts.values()]
      .map((entry) => ({
        term: entry.term,
        required: entry.required,
        // No bonus for length. Rewarding longer phrases made the winner of every family the
        // most verbose member of it — `Integrate AI-powered features through` rather than
        // `AI-powered` — and a requirement is easier to answer stated plainly.
        weight: entry.count * (TECHNICAL.test(entry.term) ? 2 : 1)
      }))
      .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));

    return { terms: AdvertMatcher.dedupe(ranked, limit), language: AdvertLexicon.languageOf(text) };
  }

  /**
   * One entry per idea, not one per window.
   *
   * Sliding an n-gram over `Integrate AI-powered features through backend APIs` produces
   * `AI-powered`, `AI-powered features`, `Integrate AI-powered features` and three more, all
   * ranked adjacently and all the same requirement. Kept as they are they crowd out every
   * other term in the advert — which is what happened the first time this ran against a real
   * one: five variants of one phrase, and `Swift` nowhere in the top twenty-four.
   *
   * Highest-ranked member wins and swallows the family. A term is dropped when it contains, or
   * is contained by, one already kept.
   * @param {Array} ranked - Terms, best first
   * @param {number} limit - How many to keep
   * @returns {Array} Terms, deduplicated
   */
  static dedupe(ranked, limit) {
    const kept = [];
    for (const entry of ranked) {
      if (kept.length >= limit) break;
      const folded = fold(entry.term);
      const overlaps = kept.some(({ term }) => {
        const other = fold(term);
        if (AdvertMatcher.contains(folded, other) || AdvertMatcher.contains(other, folded)) return true;
        // Two phrases sharing a pair of adjacent words are one idea said twice: `App Store
        // quality` and `high App Store` are not two requirements.
        const shared = AdvertMatcher.bigrams(folded).filter((pair) => AdvertMatcher.bigrams(other).includes(pair));
        return shared.length > 0;
      });
      if (overlaps) continue;
      kept.push({ term: entry.term, required: entry.required });
    }
    return kept;
  }

  /** A phrase worth ranking: not a stopword, not boilerplate, not a bare number. */
  static keeps(phrase, words) {
    if (words.some((word) => AdvertLexicon.isStopword(word))) return false;
    if (AdvertLexicon.isBoilerplate(phrase)) return false;
    if (/^[\d\W]+$/.test(phrase)) return false;
    return phrase.length >= 2 && phrase.length <= 60;
  }

  /**
   * Where the CV answers each term, at its strongest.
   *
   * The order is the point. Prose beats a list, because a term in the prose of a role is a
   * claim with a context, a date and an employer attached, while the same term in a list of
   * skills is a word. An advert asks for the first and screens on the second.
   * @param {Array} terms - From `extractTerms`
   * @param {Object} recovered - A RecoveredCv
   * @param {Object} [document] - The CvDocument, to say whether the CV claims it at all
   * @returns {{terms: Array}} The terms with their evidence
   */
  static match(terms, recovered, document = null) {
    const authored = document ? AdvertMatcher.authoredText(document) : null;
    const prose = AdvertMatcher.prose(recovered);
    const headline = AdvertMatcher.headline(recovered);
    const listed = AdvertMatcher.listed(recovered);

    return {
      terms: terms.map((entry) => AdvertMatcher.place(entry, prose, headline, listed, authored))
    };
  }

  /**
   * One term, placed — and, when the source is available, told apart from a term the CV
   * simply does not claim.
   *
   * This is the distinction the whole tool exists for. A term the CV writes but the artefact
   * lost is a **layout defect**: the renderer is wrong and the copy is fine. A term the CV
   * never wrote is a **content gap**: a human decides whether it is worth claiming, and the
   * tool must never suggest that it is.
   */
  static place(entry, prose, headline, listed, authored) {
    const claimed = authored === null ? null : AdvertMatcher.appears(entry.term, authored) !== null;
    const at = (evidence, match, where) => ({ ...entry, evidence, match, where, authored: claimed });
    {
        const inProse = AdvertMatcher.appears(entry.term, prose.text);
        if (inProse) return at('inProse', inProse, prose.whereOf(entry.term));
        const inHeadline = AdvertMatcher.appears(entry.term, headline);
        if (inHeadline) return at('inHeadline', inHeadline, 'the role line');
        const inList = AdvertMatcher.appears(entry.term, listed);
        if (inList) return at('inSkillsOnly', inList, 'the skills list');
        return at('absent', null, null);
    }
  }

  /** Everything the authored profile says, so a lost term can be told from an unwritten one. */
  static authoredText(document) {
    return [
      document.identity.title, document.identity.subtitle, document.profile,
      ...(document.careerHighlights || []),
      ...document.experience.flatMap((job) => [job.title, job.company, job.summary, ...(job.highlights || [])]),
      ...document.skills.flatMap((group) => [group.category, ...group.items.map((item) => item.name)]),
      ...document.certifications.flatMap((item) => [item.name, item.description])
    ].filter(Boolean).join('\n');
  }

  /**
   * Which required terms appear in the opening of the extracted text.
   *
   * A reader deciding whether to keep reading has not reached the skills section. If the
   * first fifteen lines establish nothing the advert asked for, the document is answering a
   * question nobody got to.
   * @param {Array} terms - Matched terms
   * @param {string} text - The extracted text
   * @param {number} [lines] - How much counts as the opening
   * @returns {{present: string[], missing: string[]}} Required terms, split
   */
  static opening(terms, text, lines = 15) {
    const head = String(text ?? '').split(/\r?\n/).filter((line) => line.trim()).slice(0, lines).join('\n');
    const required = terms.filter((entry) => entry.required);
    return {
      present: required.filter((entry) => AdvertMatcher.appears(entry.term, head)).map((entry) => entry.term),
      missing: required.filter((entry) => !AdvertMatcher.appears(entry.term, head)).map((entry) => entry.term)
    };
  }

  /** Everything a role or the summary actually claims, with the role each fragment came from. */
  static prose(recovered) {
    const blocks = [
      ...(recovered.profile ? [{ where: 'profile', text: recovered.profile }] : []),
      ...recovered.experience.map((role, index) => ({
        where: role.employer?.value || role.title?.value || `role ${index + 1}`,
        text: [role.title?.value, role.bodyText].filter(Boolean).join(' ')
      }))
    ];
    return {
      text: blocks.map((block) => block.text).join('\n'),
      // Which role carried it, so a finding can quote where the claim actually lives.
      whereOf: (term) => blocks.find((block) => AdvertMatcher.appears(term, block.text))?.where || null
    };
  }

  /** The name line and the role line: the first thing read, and the least evidenced. */
  static headline(recovered) {
    return [recovered.identity.title?.value, recovered.identity.name?.value].filter(Boolean).join(' ');
  }

  /** Skills, certifications and interests — where a word can appear without a claim behind it. */
  static listed(recovered) {
    return [
      ...recovered.skills.flatMap((group) => [group.category, ...group.items]),
      ...recovered.certifications.map((entry) => entry.text)
    ].filter(Boolean).join('\n');
  }

  /**
   * Whether a term appears, as itself or through the curated synonym table.
   *
   * Whole-word, because `AI` inside `maintain` is not a mention of artificial intelligence and
   * a matcher that counts it reports a fit the CV does not have.
   * @param {string} term - What the advert asked for
   * @param {string} haystack - Where to look
   * @returns {'exact'|'synonym'|null} How it was found
   */
  static appears(term, haystack) {
    const text = fold(haystack);
    if (AdvertMatcher.contains(text, fold(term))) return 'exact';

    for (const form of AdvertLexicon.formsOf(term)) {
      if (form !== fold(term) && AdvertMatcher.contains(text, form)) return 'synonym';
    }
    return null;
  }

  /** Every pair of adjacent words in a folded phrase. */
  static bigrams(phrase) {
    const words = phrase.split(' ');
    return words.slice(1).map((word, index) => `${words[index]} ${word}`);
  }

  static contains(haystack, needle) {
    if (!needle) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
  }
}

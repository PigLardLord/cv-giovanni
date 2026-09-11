import { readableAddress } from '../domain/ReadableUrl.js';
import { fold } from '../domain/fold.js';

/** Collapse the differences that do not change what a string says. */
const NORMALISE = {
  text: (value) =>
    fold(value)
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[.,;:]+$/, '')
      .trim(),
  email: (value) => String(value).toLowerCase().trim(),
  phone: (value) =>
    `${String(value).trim().startsWith('+') ? '+' : ''}${String(value).replace(/\D/g, '')}`,
  url: (value) => readableAddress(value).toLowerCase(),
  // Trimmed after the substitution, not before: `Architecture &` expands to
  // `architecture and ` with a trailing space, and a trailing space stops the whole-word
  // test from ever matching what follows it.
  skill: (value) =>
    NORMALISE.text(value)
      .replace(/\s*&\s*/g, ' and ')
      .replace(/\s+/g, ' ')
      .trim()
};

/** True when the shorter string is a whole-word run inside the longer. */
function overlaps(a, b) {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!shorter) return false;
  return new RegExp(`(^|\\W)${shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`).test(longer);
}

/**
 * What a stranger recovered, against what the document says.
 *
 * The existing audits ask whether a string survived. This asks whether it survived **in the
 * right slot, beside the right neighbours, in the right order** — which is the question a
 * recruiter's search actually puts to a parsed record, and the one `includes()` cannot
 * express.
 */
export class RecoveryDiff {
  /**
   * One value's fate, on a ladder from recovered exactly to not recovered at all.
   *
   * `wrong` is the interesting rung: a value of the right type in the right slot that
   * matches nothing the document wrote. It is what a layout produces when it binds the
   * wrong strings together, and it is invisible to any check that only asks whether a
   * string is present somewhere.
   * @param {string} authored - What the CV says
   * @param {string|null} recovered - What came back
   * @param {string} [kind] - Which normaliser applies
   * @returns {string} `exact`, `normalised`, `partial`, `wrong` or `lost`
   */
  static verdict(authored, recovered, kind = 'text') {
    if (recovered === null || recovered === undefined || recovered === '') return 'lost';
    if (authored === recovered) return 'exact';

    const normalise = NORMALISE[kind] || NORMALISE.text;
    const a = normalise(authored);
    const b = normalise(recovered);
    if (a === b) return 'normalised';
    return overlaps(a, b) ? 'partial' : 'wrong';
  }

  /**
   * Compare a recovered CV against the document it came from.
   * @param {Object} document - A CvDocument
   * @param {Object} recovered - A RecoveredCv
   * @returns {Object} Verdicts, by field and by structure
   */
  static diff(document, recovered) {
    const value = (field) => (field && field.value !== undefined ? field.value : field);

    const identity = {
      name: RecoveryDiff.verdict(document.identity.name, value(recovered.identity.name)),
      title: RecoveryDiff.verdict(document.identity.title, value(recovered.identity.title)),
      email: RecoveryDiff.verdict(
        document.identity.email,
        value(recovered.identity.email),
        'email'
      ),
      phone: RecoveryDiff.verdict(
        document.identity.phone,
        value(recovered.identity.phone),
        'phone'
      ),
      location: RecoveryDiff.verdict(document.identity.location, value(recovered.identity.location))
    };

    // A link the document carries but the text layer does not is the defect that is
    // invisible on the page and total in the parsed record.
    const found = (recovered.identity.addresses || []).map((address) =>
      NORMALISE.url(address.value)
    );
    const links = [
      ...(document.identity.social || []).map((item) => item.url),
      document.identity.portfolio
    ]
      .filter(Boolean)
      .map((url) => ({ url, recovered: found.includes(NORMALISE.url(url)) }));

    return {
      segmentation: recovered.segmentation,
      languages: recovered.languages,
      identity,
      links,
      sections: RecoveryDiff.sections(document, recovered),
      experience: RecoveryDiff.experience(document, recovered),
      roleOrderMonotonic: recovered.roleOrderMonotonic,
      education: RecoveryDiff.education(document, recovered),
      skills: RecoveryDiff.skills(document, recovered),
      spokenLanguages: RecoveryDiff.spokenLanguages(document, recovered),
      unexpected: RecoveryDiff.unexpected(document, recovered)
    };
  }

  /** Which sections the document has content for, and which of those were recognised. */
  static sections(document, recovered) {
    const expected = [
      ['experience', document.experience.length],
      ['skills', document.skills.length],
      ['education', document.education.length],
      ['languages', document.languages.length],
      ['certifications', document.certifications.length]
    ]
      .filter(([, count]) => count > 0)
      .map(([name]) => name);
    const seen = new Set(recovered.sections.map((section) => section.section));
    return {
      expected,
      found: expected.filter((name) => seen.has(name)),
      missing: expected.filter((name) => !seen.has(name))
    };
  }

  /** Per role: the title, the employer, the period, and whether the three arrived together. */
  static experience(document, recovered) {
    const value = (field) => (field && field.value !== undefined ? field.value : null);
    return document.experience.map((job, index) => {
      const role = recovered.experience[index];
      if (!role)
        return {
          title: 'lost',
          employer: 'lost',
          period: 'lost',
          tripleAdjacent: false,
          highlights: 'lost'
        };
      return {
        title: RecoveryDiff.verdict(job.title, value(role.title)),
        employer: RecoveryDiff.verdict(job.company, value(role.employer)),
        period: RecoveryDiff.verdict(job.period, role.period?.raw || null),
        tripleAdjacent: role.tripleAdjacent,
        // Bodies come back as lines, not achievements, so the question is whether each
        // achievement's text survives inside the block — not whether the blocks match.
        highlights: (job.highlights || []).every((highlight) =>
          NORMALISE.text(role.bodyText || '').includes(NORMALISE.text(highlight))
        )
          ? 'exact'
          : 'partial'
      };
    });
  }

  /** Per degree: the degree, the school, and whether they stayed adjacent. */
  static education(document, recovered) {
    const value = (field) => (field && field.value !== undefined ? field.value : null);
    return document.education.map((item, index) => {
      const entry = recovered.education[index];
      if (!entry) return { degree: 'lost', school: 'lost', adjacent: false };
      return {
        degree: RecoveryDiff.verdict(item.degree, value(entry.degree)),
        school: RecoveryDiff.verdict(item.school, value(entry.school)),
        adjacent: Boolean(entry.degree && entry.school)
      };
    });
  }

  /** Per category: the label, whether its own items came back, and whether they stayed with it. */
  static skills(document, recovered) {
    return document.skills.map((group) => {
      const match = recovered.skills.find(
        (candidate) =>
          candidate.category &&
          NORMALISE.skill(candidate.category) === NORMALISE.skill(group.category)
      );
      const items = (group.items || []).map((item) => item.name);
      const recoveredItems = (match?.items || []).map((item) => NORMALISE.skill(item));
      return {
        category: match
          ? RecoveryDiff.verdict(group.category, match.category, 'skill')
          : RecoveryDiff.partialCategory(group.category, recovered),
        attached: Boolean(
          match && items.every((item) => recoveredItems.includes(NORMALISE.skill(item)))
        ),
        lost: items.filter((item) => !recoveredItems.includes(NORMALISE.skill(item)))
      };
    });
  }

  /** A category that came back torn: half of it is a category, and the label is `partial`. */
  static partialCategory(category, recovered) {
    const normalised = NORMALISE.skill(category);
    const torn = recovered.skills.some(
      (candidate) => candidate.category && overlaps(normalised, NORMALISE.skill(candidate.category))
    );
    return torn ? 'partial' : 'lost';
  }

  /** Per language: the name, and the level as written. A level is never inferred. */
  static spokenLanguages(document, recovered) {
    return document.languages.map((language, index) => {
      const entry = recovered.spokenLanguages[index];
      return {
        name: RecoveryDiff.verdict(language.name, entry?.name || null),
        level: RecoveryDiff.verdict(language.level, entry?.level || null)
      };
    });
  }

  /**
   * What came back that the document never wrote.
   *
   * Invisible to any round-trip check, and the signature of interleaving: a torn category
   * produces two categories where there was one, and a shredded column produces roles that
   * exist in no source.
   */
  static unexpected(document, recovered) {
    const authored = new Set(document.skills.map((group) => NORMALISE.skill(group.category)));
    return {
      skillCategories: recovered.skills
        .filter((group) => group.category && !authored.has(NORMALISE.skill(group.category)))
        .map((group) => group.category),
      roles: Math.max(0, recovered.experience.length - document.experience.length)
    };
  }
}

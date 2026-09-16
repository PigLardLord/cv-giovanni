import { readableAddress } from '../domain/ReadableUrl.js';
import { fold } from '../domain/fold.js';
import { certificationLine, degreeLine } from '../domain/EntryLines.js';

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

/** Verdicts short of recovered: a field graded one of these is a loss the report names. */
const SHORT = ['partial', 'wrong', 'lost'];

/** The parts of a diff whose fields are graded on the ladder, in the order a reader meets them. */
const GRADED = [
  'identity',
  'experience',
  'education',
  'skills',
  'spokenLanguages',
  'certifications'
];

/** True for a value that holds nothing to quote: none, an empty string, or an empty list. */
const nothing = (value) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);

/** A line's pieces, as `domain/EntryLines.js` builds them, as the text they print. */
const lineText = (pieces) =>
  pieces.map((piece) => (typeof piece === 'string' ? piece : piece.text)).join('');

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
   * @param {Object} [options]
   * @param {{ credits?: (count: string) => string, locale?: string }} [options.words] - How the document wrote a
   *   count of credits, as `degreeLine` takes them. Without them a degree's printed scope cannot be rebuilt, and a
   *   scope the document printed reads as a loss: the default errs toward a loss, never toward full marks.
   * @returns {Object} Verdicts, by field and by structure
   */
  static diff(document, recovered, { words = {} } = {}) {
    const value = (field) => (field && field.value !== undefined ? field.value : field);

    // What was written and what came back, kept beside each verdict under the verdict's path, so the report can
    // quote a loss rather than only name it (#186).
    const evidence = {};
    const keep = (path, verdict, written, got) => {
      evidence[path.join('.')] = {
        written: nothing(written) ? null : written,
        recovered: nothing(got) ? null : got
      };
      return verdict;
    };
    const grade = (path, written, got, kind) =>
      keep(path, RecoveryDiff.verdict(written, got, kind), written, got);
    const grading = { grade, keep };

    const identity = {
      name: grade(['identity', 'name'], document.identity.name, value(recovered.identity.name)),
      title: grade(['identity', 'title'], document.identity.title, value(recovered.identity.title)),
      email: grade(
        ['identity', 'email'],
        document.identity.email,
        value(recovered.identity.email),
        'email'
      ),
      phone: grade(
        ['identity', 'phone'],
        document.identity.phone,
        value(recovered.identity.phone),
        'phone'
      ),
      location: grade(
        ['identity', 'location'],
        document.identity.location,
        value(recovered.identity.location)
      )
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
      experience: RecoveryDiff.experience(document, recovered, grading),
      roleOrderMonotonic: recovered.roleOrderMonotonic,
      education: RecoveryDiff.education(document, recovered, { ...grading, words }),
      skills: RecoveryDiff.skills(document, recovered, grading),
      spokenLanguages: RecoveryDiff.spokenLanguages(document, recovered, grading),
      certifications: RecoveryDiff.certifications(document, recovered, grading),
      unexpected: RecoveryDiff.unexpected(document, recovered),
      evidence
    };
  }

  /**
   * Every graded field that came back short of recovered — partial, wrong or lost — with what was written and what
   * came back.
   *
   * Read off the verdicts, not off the evidence: a verdict with nothing kept beside it is still a loss, and is listed
   * with nothing quoted rather than left out.
   * @param {Object} diff - A RecoveryDiff result
   * @returns {{ path: (string|number)[], verdict: string, written: *, recovered: * }[]} The losses, in reading order
   */
  static losses(diff) {
    return GRADED.flatMap((part) => {
      const node = diff[part];
      const entries = Array.isArray(node)
        ? node.map((entry, index) => [[part, index], entry])
        : [[[part], node]];
      return entries.flatMap(([at, entry]) =>
        Object.entries(entry || {})
          .filter(([, verdict]) => SHORT.includes(verdict))
          .map(([field, verdict]) => {
            const path = [...at, field];
            const kept = diff.evidence?.[path.join('.')];
            return {
              path,
              verdict,
              written: kept?.written ?? null,
              recovered: kept?.recovered ?? null
            };
          })
      );
    });
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
  static experience(document, recovered, { grade, keep }) {
    const value = (field) => (field && field.value !== undefined ? field.value : null);
    return document.experience.map((job, index) => {
      const at = (field) => ['experience', index, field];
      const role = recovered.experience[index];
      // Bodies come back as lines, not achievements, so the question is whether each
      // achievement's text survives inside the block — not whether the blocks match.
      const body = NORMALISE.text(role?.bodyText || '');
      const missing = (job.highlights || []).filter(
        (highlight) => !body.includes(NORMALISE.text(highlight))
      );
      return {
        title: grade(at('title'), job.title, value(role?.title)),
        employer: grade(at('employer'), job.company, value(role?.employer)),
        // The dates, without the length a document writes after them (#55).
        period: grade(at('period'), job.period, role?.period?.span || null),
        tripleAdjacent: role ? role.tripleAdjacent : false,
        highlights: keep(
          at('highlights'),
          !role ? 'lost' : missing.length ? 'partial' : 'exact',
          missing,
          null
        )
      };
    });
  }

  /**
   * Per degree: the degree, the school, and whether they stayed adjacent.
   *
   * A degree is compared as the document prints it, not as the profile's `degree` field holds it: its name and the
   * scope it states after the name, "… Development (60 ECTS)", built by `degreeLine`, the function the page prints it
   * with (#48). A parser that returns the printed line lost nothing the document said, so a stated scope costs
   * nothing; one that returns the name without the printed scope, or cuts it short, lost part of it (#186).
   */
  static education(document, recovered, { grade, words }) {
    const value = (field) => (field && field.value !== undefined ? field.value : null);
    return document.education.map((item, index) => {
      const entry = recovered.education[index];
      return {
        degree: grade(
          ['education', index, 'degree'],
          lineText(degreeLine(item, words)),
          value(entry?.degree)
        ),
        school: grade(['education', index, 'school'], item.school, value(entry?.school)),
        adjacent: Boolean(entry?.degree && entry?.school)
      };
    });
  }

  /** Per category: the label, whether its own items came back, and whether they stayed with it. */
  static skills(document, recovered, { grade, keep }) {
    return document.skills.map((group, index) => {
      const at = ['skills', index, 'category'];
      const match = recovered.skills.find(
        (candidate) =>
          candidate.category &&
          NORMALISE.skill(candidate.category) === NORMALISE.skill(group.category)
      );
      const items = (group.items || []).map((item) => item.name);
      const recoveredItems = (match?.items || []).map((item) => NORMALISE.skill(item));
      // A category that came back torn: half of it is a category, and the label is `partial`.
      const torn = match ? [] : RecoveryDiff.tornPieces(group.category, recovered);
      return {
        category: match
          ? grade(at, group.category, match.category, 'skill')
          : keep(at, torn.length ? 'partial' : 'lost', group.category, torn),
        attached: Boolean(
          match && items.every((item) => recoveredItems.includes(NORMALISE.skill(item)))
        ),
        lost: items.filter((item) => !recoveredItems.includes(NORMALISE.skill(item)))
      };
    });
  }

  /**
   * The recovered categories a written one was torn into: each a whole-word run of it, or it of them.
   * @param {string} category - The category as written
   * @param {Object} recovered - A RecoveredCv
   * @returns {string[]} The pieces, as they came back; none when nothing of it did
   */
  static tornPieces(category, recovered) {
    const normalised = NORMALISE.skill(category);
    return recovered.skills
      .filter(
        (candidate) =>
          candidate.category && overlaps(normalised, NORMALISE.skill(candidate.category))
      )
      .map((candidate) => candidate.category);
  }

  /** Per language: the name, and the level as written. A level is never inferred. */
  static spokenLanguages(document, recovered, { grade }) {
    return document.languages.map((language, index) => {
      const entry = recovered.spokenLanguages[index];
      return {
        name: grade(['spokenLanguages', index, 'name'], language.name, entry?.name || null),
        level: grade(['spokenLanguages', index, 'level'], language.level, entry?.level || null)
      };
    });
  }

  /**
   * Per certification: its line, compared as the page prints it — the name, then " – issuer" and " (year)" when it has
   * them, from `certificationLine` (#169) — against the line recovered in the same place.
   *
   * Graded so a loss is named, and weighed nowhere: the fidelity band's parts were set before certifications were
   * compared, and giving them weight is a decision of its own (#186).
   */
  static certifications(document, recovered, { grade }) {
    return document.certifications.map((certification, index) => ({
      name: grade(
        ['certifications', index, 'name'],
        `${String(certification.name ?? '')}${certificationLine(certification).join('')}`,
        recovered.certifications[index]?.text || null
      )
    }));
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

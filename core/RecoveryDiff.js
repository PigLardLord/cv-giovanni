import { readableAddress } from '../domain/ReadableUrl.js';
import { fold } from '../domain/fold.js';
import { certificationLine, degreeLine, schoolLine } from '../domain/EntryLines.js';

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

/**
 * A degree's period as its school line prints it, "(2014 – 2016)", without the brackets `schoolLine` sets it in: a
 * parser reads them as the line's punctuation, as it reads " · ", and returns the period alone (#200).
 * @param {{ school?: string, period?: string }} degree - One degree of the education
 * @returns {string|null} The period; none when the line prints none
 */
const printedPeriod = (degree) => {
  const piece = schoolLine(degree).find((part) => part.field === 'period');
  return piece ? piece.text.replace(/^\((.*)\)$/, '$1') : null;
};

/**
 * How much a verdict says a recovered entry is the one written: a whole value more than part of one, a wrong or a lost
 * value nothing.
 */
const LIKENESS = { exact: 2, normalised: 2, partial: 1, wrong: 0, lost: 0 };

/** How much a recovered value says of a written one, from `LIKENESS`. */
const like = (written, got, kind) => LIKENESS[RecoveryDiff.verdict(written, got, kind)];

/** A recovered field's value; none when nothing came back. */
const fieldValue = (field) => (field && field.value !== undefined ? field.value : null);

/** Two likenesses, the most telling field first: negative when the first is the better match. */
const better = (a, b) => {
  for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
    if ((a[at] ?? 0) !== (b[at] ?? 0)) return (b[at] ?? 0) - (a[at] ?? 0);
  }
  return 0;
};

/** A certification's line as the page prints it: the name, then " – issuer" and " (year)" when it has them (#169). */
const printedCertification = (certification) =>
  `${String(certification.name ?? '')}${certificationLine(certification).join('')}`;

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
      unmatched: RecoveryDiff.unmatched(document, recovered, words),
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

  /**
   * Which recovered entry answers for each written one, matched by what the two say rather than where they stand (#217).
   *
   * By position, a parser that dropped the first of three degrees compared the second with the first and the third with
   * the second: one loss read as three, and none of them named the degree it was. So every written entry is weighed
   * against every recovered one on the fields that identify it, on the verdict ladder, the most telling first. A pair is
   * a candidate only when the first of them says something: the rest break a tie and never make a match on their own,
   * or a role nobody wrote that happens to print a written role's dates is taken for that role, reads its period and
   * achievements as recovered, and is never counted as invented (the code review of #222). The best pairs are taken
   * first, a tie going to the earlier written entry and then to the earlier recovered one, and each entry is taken once.
   * A written entry that nothing recovered identifies is matched to none, and is lost; a recovered entry no written one
   * took is left over, and was never written.
   * @param {Object[]} written - The document's entries
   * @param {Object[]} recovered - The entries a parser recovered, in the order it recovered them
   * @param {(written: Object, recovered: Object) => number[]} likeness - How much a recovered entry says of a written
   *   one, each from `LIKENESS`: first what identifies the entry, then what breaks a tie between two it identifies
   * @returns {{ matched: (Object|null)[], unmatched: Object[] }} Each written entry's match, in the document's order,
   *   and the recovered entries nothing was matched to, in the order they were recovered
   */
  static match(written, recovered, likeness) {
    const pairs = written
      .flatMap((entry, at) =>
        recovered.map((candidate, from) => ({ at, from, likeness: likeness(entry, candidate) }))
      )
      .filter((pair) => pair.likeness[0] > 0)
      .sort((a, b) => better(a.likeness, b.likeness) || a.at - b.at || a.from - b.from);
    const matched = written.map(() => null);
    const taken = new Set();
    for (const { at, from } of pairs) {
      if (matched[at] !== null || taken.has(from)) continue;
      matched[at] = from;
      taken.add(from);
    }
    return {
      matched: matched.map((from) => (from === null ? null : recovered[from])),
      unmatched: recovered.filter((_, from) => !taken.has(from))
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

  /**
   * Each written role's recovered match, and the recovered roles nothing was matched to. A role is identified by its
   * title and its employer, and its dates only break a tie between two roles those match equally (#217): a role that
   * came back with neither, as a flattened table leaves one, matches none written, whatever dates it prints.
   * @param {Object} document - A CvDocument
   * @param {Object} recovered - A RecoveredCv
   * @returns {{ matched: (Object|null)[], unmatched: Object[] }} As `match` returns them
   */
  static roles(document, recovered) {
    return RecoveryDiff.match(document.experience, recovered.experience, (job, role) => [
      like(job.title, fieldValue(role.title)) + like(job.company, fieldValue(role.employer)),
      like(job.period, role.period?.span || null)
    ]);
  }

  /**
   * Per role: the title, the employer, the period, and whether the three arrived together.
   *
   * Each graded against the role recovered that says the most of it, not the one in the same place (#217): the order
   * the roles came back in is the chronology's to judge, in the order they came back.
   */
  static experience(document, recovered, { grade, keep }) {
    const { matched } = RecoveryDiff.roles(document, recovered);
    return document.experience.map((job, index) => {
      const at = (field) => ['experience', index, field];
      const role = matched[index];
      // Bodies come back as lines, not achievements, so the question is whether each
      // achievement's text survives inside the block — not whether the blocks match.
      const body = NORMALISE.text(role?.bodyText || '');
      const missing = (job.highlights || []).filter(
        (highlight) => !body.includes(NORMALISE.text(highlight))
      );
      return {
        title: grade(at('title'), job.title, fieldValue(role?.title)),
        employer: grade(at('employer'), job.company, fieldValue(role?.employer)),
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
   * Each written degree's recovered match, and the recovered degrees nothing was matched to. A degree is identified by
   * the line its name prints and by its school, and the period it prints only breaks a tie between two degrees those
   * match equally (#217).
   * @param {Object} document - A CvDocument
   * @param {Object} recovered - A RecoveredCv
   * @param {Object} words - How the document wrote a count of credits, as `education` takes them
   * @returns {{ matched: (Object|null)[], unmatched: Object[] }} As `match` returns them
   */
  static degrees(document, recovered, words) {
    return RecoveryDiff.match(document.education, recovered.education, (item, got) => [
      like(lineText(degreeLine(item, words)), fieldValue(got.degree)) +
        like(item.school, fieldValue(got.school)),
      printedPeriod(item) === null ? 0 : like(printedPeriod(item), got.period)
    ]);
  }

  /**
   * Per degree: the degree, the school, the period when it prints one, and whether the degree and school stayed
   * adjacent.
   *
   * A degree is compared as the document prints it, not as the profile's `degree` field holds it: its name and the
   * scope it states after the name, "… Development (60 ECTS)", built by `degreeLine`, the function the page prints it
   * with (#48). A parser that returns the printed line lost nothing the document said, so a stated scope costs
   * nothing; one that returns the name without the printed scope, or cuts it short, lost part of it (#186).
   *
   * The period is compared as the school line prints it, without its brackets, the way a role's period is graded. A
   * degree that prints no period has none to lose, and carries no period verdict (#200).
   */
  static education(document, recovered, { grade, words }) {
    const { matched } = RecoveryDiff.degrees(document, recovered, words);
    return document.education.map((item, index) => {
      const entry = matched[index];
      const period = printedPeriod(item);
      return {
        degree: grade(
          ['education', index, 'degree'],
          lineText(degreeLine(item, words)),
          fieldValue(entry?.degree)
        ),
        school: grade(['education', index, 'school'], item.school, fieldValue(entry?.school)),
        ...(period === null
          ? {}
          : { period: grade(['education', index, 'period'], period, entry?.period || null) }),
        adjacent: Boolean(entry?.degree && entry?.school)
      };
    });
  }

  /**
   * Per category: the label, whether its own items came back, and whether they stayed with it.
   *
   * A category is matched by its label, whole: a label recovered in part is a category torn in two, and its pieces are
   * graded as such. Each recovered category answers for one written category (#217), and is not also a piece of
   * another.
   */
  static skills(document, recovered, { grade, keep }) {
    const { matched, unmatched } = RecoveryDiff.match(
      document.skills,
      recovered.skills,
      (group, candidate) => {
        const verdict = RecoveryDiff.verdict(group.category, candidate.category, 'skill');
        return [verdict === 'exact' || verdict === 'normalised' ? LIKENESS[verdict] : 0];
      }
    );
    return document.skills.map((group, index) => {
      const at = ['skills', index, 'category'];
      const match = matched[index];
      const items = (group.items || []).map((item) => item.name);
      const recoveredItems = (match?.items || []).map((item) => NORMALISE.skill(item));
      // A category that came back torn: half of it is a category, and the label is `partial`.
      const torn = match ? [] : RecoveryDiff.tornPieces(group.category, unmatched);
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
   * @param {Object[]} candidates - The recovered categories no written one was matched to: one that was is that one's
   *   category, not a piece of another
   * @returns {string[]} The pieces, as they came back; none when nothing of it did
   */
  static tornPieces(category, candidates) {
    const normalised = NORMALISE.skill(category);
    return candidates
      .filter(
        (candidate) =>
          candidate.category && overlaps(normalised, NORMALISE.skill(candidate.category))
      )
      .map((candidate) => candidate.category);
  }

  /**
   * Each written language's recovered match, told by its name, and the recovered languages nothing was matched to.
   * @param {Object} document - A CvDocument
   * @param {Object} recovered - A RecoveredCv
   * @returns {{ matched: (Object|null)[], unmatched: Object[] }} As `match` returns them
   */
  static languages(document, recovered) {
    return RecoveryDiff.match(document.languages, recovered.spokenLanguages, (language, entry) => [
      like(language.name, entry.name || null)
    ]);
  }

  /**
   * Per language: the name, and the level as written. A level is never inferred.
   *
   * A language is matched by its name (#217): the level a parser recovered beside it is the one graded.
   */
  static spokenLanguages(document, recovered, { grade }) {
    const { matched } = RecoveryDiff.languages(document, recovered);
    return document.languages.map((language, index) => {
      const entry = matched[index];
      return {
        name: grade(['spokenLanguages', index, 'name'], language.name, entry?.name || null),
        level: grade(['spokenLanguages', index, 'level'], language.level, entry?.level || null)
      };
    });
  }

  /**
   * Per certification: its line, compared as the page prints it — the name, then " – issuer" and " (year)" when it has
   * them, from `certificationLine` (#169) — against the recovered line that says the most of it (#217).
   *
   * Graded so a loss is named, and weighed nowhere: the fidelity band's parts were set before certifications were
   * compared, and giving them weight is a decision of its own (#186).
   */
  static certifications(document, recovered, { grade }) {
    const { matched } = RecoveryDiff.certificationLines(document, recovered);
    return document.certifications.map((certification, index) => ({
      name: grade(
        ['certifications', index, 'name'],
        printedCertification(certification),
        matched[index]?.text || null
      )
    }));
  }

  /**
   * Each written certification's recovered line, told by the line it prints, and the recovered lines nothing was
   * matched to.
   * @param {Object} document - A CvDocument
   * @param {Object} recovered - A RecoveredCv
   * @returns {{ matched: (Object|null)[], unmatched: Object[] }} As `match` returns them
   */
  static certificationLines(document, recovered) {
    return RecoveryDiff.match(
      document.certifications,
      recovered.certifications,
      (certification, entry) => [like(printedCertification(certification), entry.text || null)]
    );
  }

  /**
   * The roles, degrees, languages and certifications that came back and that no written one was matched to, each as
   * the values it came back with (#217).
   *
   * Listed so the report can quote what came back, since none of them is graded against the entry in its place. Each
   * costs what it cost before: a role nobody wrote is charged, and `unexpected.roles` counts these; a degree, a
   * language or a certification nobody wrote is charged nothing, and weighing one is a decision of its own. A
   * category nobody wrote is `unexpected.skillCategories`.
   * @param {Object} document - A CvDocument
   * @param {Object} recovered - A RecoveredCv
   * @param {Object} words - How the document wrote a count of credits, as `education` takes them
   * @returns {{ experience: string[][], education: string[][], spokenLanguages: string[][], certifications: string[][] }}
   *   Each section's entries nobody wrote, in the order they came back
   */
  static unmatched(document, recovered, words) {
    const values = (...fields) => fields.filter((field) => !nothing(field));
    return {
      experience: RecoveryDiff.roles(document, recovered).unmatched.map((role) =>
        values(fieldValue(role.title), fieldValue(role.employer), role.period?.span)
      ),
      education: RecoveryDiff.degrees(document, recovered, words).unmatched.map((entry) =>
        values(fieldValue(entry.degree), fieldValue(entry.school), entry.period)
      ),
      spokenLanguages: RecoveryDiff.languages(document, recovered).unmatched.map((entry) =>
        values(entry.name, entry.level)
      ),
      certifications: RecoveryDiff.certificationLines(document, recovered).unmatched.map((entry) =>
        values(entry.text)
      )
    };
  }

  /**
   * What came back that the document never wrote.
   *
   * Invisible to any round-trip check, and the signature of interleaving: a torn category
   * produces two categories where there was one, and a shredded column produces roles that
   * exist in no source. A role nobody wrote is one no written role was matched to, not one
   * past the document's count: a role that says nothing of any written one is invented though
   * the document holds as many (#217).
   */
  static unexpected(document, recovered) {
    const authored = new Set(document.skills.map((group) => NORMALISE.skill(group.category)));
    return {
      skillCategories: recovered.skills
        .filter((group) => group.category && !authored.has(NORMALISE.skill(group.category)))
        .map((group) => group.category),
      roles: RecoveryDiff.roles(document, recovered).unmatched.length
    };
  }
}

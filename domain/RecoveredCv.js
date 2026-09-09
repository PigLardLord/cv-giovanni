/**
 * What a stranger's parser got out of the document.
 *
 * The mirror of `CvDocument`, and deliberately not the same class: that one is what the CV
 * *says*, built from the authored JSON; this is what a reader with no access to the source
 * could *recover* from the artefact. The whole value of the pair is in their difference.
 *
 * Every recovered value carries the line it came from. A finding that cannot quote its
 * evidence is an opinion, and a reader must be able to audit the parser rather than trust
 * it — the parser's own bugs would otherwise read as defects in the CV.
 */
export class RecoveredCv {
  constructor(parts = {}) {
    /** `failed` when too few headings were found to segment anything. */
    this.segmentation = parts.segmentation || 'failed';
    /** Every language whose headings were recognised. More than one is a finding. */
    this.languages = parts.languages || [];
    /** `{ name, title, location, email, phone, addresses, otherHeaderLines }`, each a field. */
    this.identity = parts.identity || {};
    /** The headings found, in the order they appeared. */
    this.sections = parts.sections || [];
    this.profile = parts.profile || null;
    this.experience = parts.experience || [];
    this.education = parts.education || [];
    this.skills = parts.skills || [];
    this.spokenLanguages = parts.spokenLanguages || [];
    this.certifications = parts.certifications || [];
    /** Lines inside a recognised section that no rule claimed. */
    this.unassigned = parts.unassigned || [];
  }

  /** One recovered value and where it was read. */
  static field(value, line) {
    return value === null || value === undefined || value === '' ? null : { value, line };
  }

  /**
   * True when every role's title, employer and period sit within three consecutive lines.
   *
   * This is the check a sidebar or a table destroys and `includes()` cannot express: the
   * three strings are all still present, just no longer next to each other, and a parser
   * binding them by proximity binds the wrong ones together.
   */
  get tripleAdjacent() {
    return this.experience.length > 0 && this.experience.every((role) => role.tripleAdjacent);
  }

  /**
   * True when the recovered roles run from most recent to least.
   *
   * Interleaved columns produce a career that jumps back and forth in time, which is
   * detectable without knowing anything about the layout that caused it.
   */
  get roleOrderMonotonic() {
    // A document with no roles has no chronology to run one way. `[].every()` is true, and
    // awarding points for it would pay a failed parse for the career it did not recover.
    if (!this.experience.length) return false;
    const starts = this.experience
      .map((role) => role.period?.start)
      .filter(Boolean)
      .map((start) => start.year * 12 + (start.month || 1));
    return starts.every((value, index) => index === 0 || value <= starts[index - 1]);
  }
}

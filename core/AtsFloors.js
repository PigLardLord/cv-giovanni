/**
 * The floors: not the score, which never gates anything, but the four failures that mean the parsed
 * record is unusable however good the rest looks.
 *
 * Kept apart from the script so they can be shown failing. The audit applies them to two readings of
 * every artefact — poppler's own order and the content stream's, which PDFBox and Tika read by default
 * (#147) — and a floor that holds in one order and not the other has not held.
 */
export class AtsFloors {
  /**
   * @param {Object} diff - A RecoveryDiff result
   * @returns {string[]} The floors this reading fails, empty when it fails none
   */
  static failures(diff) {
    return [
      diff.segmentation !== 'ok' && 'the document did not segment',
      diff.identity.email === 'lost' && 'the email address was not recovered',
      diff.experience.some((role) => !role.tripleAdjacent) &&
        'a role lost its title, employer or period',
      !diff.roleOrderMonotonic && 'the chronology does not run one way'
    ].filter(Boolean);
  }
}

import { bindSeparators, createSeparatorElement, joinSeparated, SEPARATOR_GLYPH } from './inlineSeparator.js';

/**
 * The cue that opens page two when one job entry spans the page break.
 *
 * Chromium gives a stylesheet no way to repeat a block's header when the block
 * fragments — `thead` does that, and only inside a table — so the cue has to be
 * placed by hand. *Where* it goes used to be declared: an employer name and a
 * highlight index, both literals, correct only for the copy they were measured
 * against. Renaming the employer in the data silently removed the cue and left
 * orphaned bullets with no role attached to them.
 *
 * Now the split is measured. `Paginator` reports which highlight of which entry
 * first lands on a later page, and the marker is placed there. Nothing in this
 * class reads a company name.
 */
export class ContinuationMarker {
  /**
   * @param {Object} [options]
   * @param {Map<number, number>} [options.cuts] - Entry position to cut index,
   *   as measured by `Paginator`. Empty until the first measurement, which is
   *   why the first render carries no marker and the re-render does.
   */
  constructor({ cuts = new Map(), i18n = null } = {}) {
    this.cuts = cuts;
    this.i18n = i18n;
  }

  /**
   * Where the entry at this position is cut, if it is cut at all.
   *
   * Index zero is refused: breaking there would move the whole entry instead of
   * continuing it, leaving a heading with no body behind on page one.
   *
   * @param {number} entryIndex - Position of the entry being rendered
   * @returns {number|null} Cut index, or null when the entry is not split
   */
  cutFor(entryIndex) {
    const cut = this.cuts.get(entryIndex);
    return Number.isInteger(cut) && cut > 0 ? cut : null;
  }

  /**
   * Build the block that opens the continuation page.
   * @param {Document} root - DOM root
   * @param {Object} job - The entry being continued
   * @param {Object} data - CV data, for the running header identity
   * @returns {Element} The marker element
   */
  create(root, job, data) {
    const marker = root.createElement('div');
    marker.className = 'job-continuation';

    const header = this.createRunningHeader(root, data);
    if (header) marker.appendChild(header);

    const label = root.createElement('span');
    label.className = 'continuation-label';
    label.textContent = this.toLabel(job);
    marker.appendChild(label);

    return marker;
  }

  /**
   * The cue itself: the entry's compact header, repeated in full.
   *
   * A bare company name leaves the reader facing a run of bullets with no role
   * attached to them, so the whole header is repeated — role, employer, years —
   * with the period reduced to its years to keep it to one line. Any part the
   * entry does not carry is simply left out.
   *
   * The cue runs to most of the measure and may wrap, so its separators are
   * bound to the words either side of them — the ones joining the parts here,
   * and any the title brought with it from the data. The line still breaks
   * between words; it can no longer break beside a glyph and strand it.
   * @param {Object} job - The entry being continued
   * @returns {string} The continuation cue
   */
  toLabel(job) {
    const parts = [this.toText(job.title), this.toText(job.company), this.toYears(job.period)]
      .filter(Boolean)
      .map((part) => bindSeparators(part));

    const continued = this.i18n
      ? this.i18n.t('continued', { ns: 'print' })
      : 'continued';
    return `${joinSeparated(parts)} (${continued})`.trim();
  }

  /**
   * Reduce a period to the years that span it.
   * @param {string} period - Period as written in the data
   * @returns {string} `2018–2026`, `2015`, or an empty string
   */
  toYears(period) {
    const years = this.toText(period).match(/\d{4}/g);
    if (!years) return '';

    const span = [years[0], years[years.length - 1]];
    return span[0] === span[1] ? span[0] : span.join('–');
  }

  /**
   * The page-two running head: who this sheet belongs to, should the pages get
   * separated. Only the leading role is kept — the qualifiers after the title's
   * own separator do not survive at running-head size.
   * @param {Document} root - DOM root
   * @param {Object} data - CV data
   * @returns {Element|null} Running header, or null when there is no identity
   */
  createRunningHeader(root, data) {
    const parts = [this.toText(data && data.name), this.toRole(data && data.title)]
      .filter(Boolean);

    if (parts.length === 0) return null;

    const header = root.createElement('span');
    header.className = 'running-header';

    parts.forEach((part, index) => {
      if (index > 0) header.appendChild(createSeparatorElement(root));
      const piece = root.createElement('span');
      piece.textContent = part;
      header.appendChild(piece);
    });

    return header;
  }

  toRole(title) {
    return this.toText(title).split(SEPARATOR_GLYPH)[0].trim();
  }

  toText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
}

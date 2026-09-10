/**
 * A cover letter, as the data writes it.
 *
 * The counterpart of `CvDocument`: framework-free, no I/O, and the single shape every output
 * boundary consumes. It normalises a partial letter rather than trusting a complete one,
 * because a letter is written once per application and the half-filled state is the normal
 * one, not the exception.
 *
 * What it will not do is invent. A missing recipient is reported as missing, never replaced
 * with a plausible name — `cv-composer` already carries that rule for copy, and the model
 * enforces it in the only way a model can: by making the absence legible. `missing` exists so
 * a caller can ask instead of guessing.
 *
 * It says **who** is addressed, never **how**. The wording of a salutation belongs to the
 * catalogue, like every other user-visible string in this project; a domain object that wrote
 * "Dear Hiring Team" would be a German letter's bug waiting to happen.
 */
export class CoverLetter {
  constructor(data = {}) {
    const recipient = data.recipient || {};
    this.recipient = {
      name: text(recipient.name),
      role: text(recipient.role),
      company: text(recipient.company),
      address: lines(recipient.address)
    };
    /** As the data wrote it. Formatting belongs to `Intl` at the boundary, not here. */
    this.date = text(data.date);
    /** The advert's own reference, when it has one. A recruiter searches by it. */
    this.reference = text(data.reference);
    this.subject = text(data.subject);
    this.opening = text(data.opening);
    this.body = lines(data.body);
    this.closing = text(data.closing);
    this.signature = text(data.signature);
    this.attachments = lines(data.attachments);
  }

  /** Who to address, or null. The wording is the catalogue's business. */
  get addressee() {
    return this.recipient.name || null;
  }

  /**
   * What the letter still needs.
   *
   * Named rather than filled: a letter addressed to nobody at a company nobody named is worse
   * than no letter, and the only honest thing a model can do about it is say so.
   * @returns {string[]} Field names, in the order a writer would fill them
   */
  get missing() {
    const required = [
      ['recipient.company', this.recipient.company],
      ['subject', this.subject],
      ['opening', this.opening],
      ['body', this.body.length ? 'yes' : ''],
      ['signature', this.signature]
    ];
    return required.filter(([, value]) => !value).map(([name]) => name);
  }

  /** Enough to put in front of an employer. */
  get isComplete() {
    return this.missing.length === 0;
  }

  /** Every word the letter says, for an audit that asks what survived extraction. */
  get prose() {
    return [this.subject, this.opening, ...this.body, this.closing].filter(Boolean).join('\n');
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** A block that may arrive as one string or as the paragraphs it already is. */
function lines(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? single.split(/\n{2,}/).map(text).filter(Boolean) : [];
}

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
 *
 * Which form greets them is the author's to write, never inferred from a first name (#174): a
 * form of address is a code, `ms`, `mr` or `neutral`, that each catalogue words in its own
 * language, and the surname is a field of its own, since cutting one from a name is guessing.
 */
/**
 * The lines DIN 5008's address zone holds: 27.3mm, filled from the top. A seventh prints below the zone, on the row of
 * the date and outside a window envelope's window (the review of #151).
 */
export const ADDRESS_ZONE_LINES = 6;

/**
 * How a named recipient can be greeted: by surname after the catalogue's word for a woman or a man, or by name in the
 * neutral form. Codes rather than "Frau" or "Ms", so one recipient reads the same in every language's letter.
 */
export const FORMS_OF_ADDRESS = ['ms', 'mr', 'neutral'];

export class CoverLetter {
  constructor(data = {}) {
    const recipient = data.recipient || {};
    this.recipient = {
      name: text(recipient.name),
      /** As the data wrote it; `greeting` says which form applies. */
      form: text(recipient.form),
      /** An academic title the salutation puts before the surname, as the letter's language writes it: `Dr.`. */
      title: text(recipient.title),
      surname: text(recipient.surname),
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

  /** Every line of the recipient the data wrote, company first, in the order a window envelope shows them. */
  get recipientLines() {
    return [
      this.recipient.company,
      this.recipient.name,
      this.recipient.role,
      ...this.recipient.address
    ].filter(Boolean);
  }

  /** Who to address, or null. The wording is the catalogue's business. */
  get addressee() {
    return this.recipient.name || null;
  }

  /**
   * How the letter greets its recipient, and with which of their names: the form of address the author wrote, when
   * the surname it needs is there; the neutral form, by name, when a name is and nothing else says how; and the
   * anonymous opening when nobody is named. The fallbacks are what `missing` names, so the author is asked.
   * @returns {{ form: 'ms'|'mr'|'neutral'|'anonymous', name: string, surname: string, title: string }} The form,
   *   and the names the catalogue's wording for it may use
   */
  get greeting() {
    const { name, surname, title } = this.recipient;
    const form = this.#form;
    const resolved =
      (form === 'ms' || form === 'mr') && surname ? form : name ? 'neutral' : 'anonymous';
    return { form: resolved, name, surname, title };
  }

  /** The form of address written, if it is one the model knows, or ''. */
  get #form() {
    const form = this.recipient.form.toLowerCase();
    return FORMS_OF_ADDRESS.includes(form) ? form : '';
  }

  /** What greeting the recipient by the form of address still needs: a form, or the name that form greets. */
  get #greetingNeeds() {
    const { name, surname } = this.recipient;
    const form = this.#form;
    if (!form) return name || surname ? ['recipient.form'] : [];
    if (form === 'neutral') return name ? [] : ['recipient.name'];
    return surname ? [] : ['recipient.surname'];
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
      ['subject', this.subject],
      ['opening', this.opening],
      ['body', this.body.length ? 'yes' : ''],
      ['signature', this.signature]
    ];
    return [
      ...(this.recipient.company ? [] : ['recipient.company']),
      ...this.#greetingNeeds,
      ...required.filter(([, value]) => !value).map(([name]) => name)
    ];
  }

  /**
   * What the letter needs before it is sent: every field it still misses, and a recipient longer than the address
   * zone holds. Named, never corrected: no line is dropped to make an address fit, since which one can go is the
   * writer's call.
   * @returns {string[]} Each problem as `field: what is wrong`, missing fields first
   */
  get problems() {
    const lines = this.recipientLines.length;
    // A form of address written but not one the model knows is named with what was written, so "Frau" is recognised.
    const known = `${FORMS_OF_ADDRESS.slice(0, -1).join(', ')} or ${FORMS_OF_ADDRESS.at(-1)}`;
    const wrong = (field) =>
      field === 'recipient.form' && this.recipient.form
        ? `${JSON.stringify(this.recipient.form)} is not ${known}`
        : 'missing';
    return [
      ...this.missing.map((field) => `${field}: ${wrong(field)}`),
      ...(lines > ADDRESS_ZONE_LINES
        ? [`recipient: ${lines} lines, the address zone holds ${ADDRESS_ZONE_LINES}`]
        : [])
    ];
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
  return single
    ? single
        .split(/\n{2,}/)
        .map(text)
        .filter(Boolean)
    : [];
}

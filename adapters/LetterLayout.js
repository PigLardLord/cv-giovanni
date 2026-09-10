/**
 * A cover letter on a page, laid out to DIN 5008 form B.
 *
 * The sibling of `adapters/PdfLayout.js`, and it speaks the same dialect: points, columns,
 * canvas rectangles, style names. It takes the theme of whichever CV layout it accompanies,
 * because a letter set in a different typeface to its CV reads as two documents from two
 * people, and the pair arrives in one envelope.
 *
 * DIN 5008 is not decoration in the German market: the address block sits where a window
 * envelope shows it, and a letter that ignores that is a letter someone has to re-fold. Form B
 * is the one with the larger information field, which is what a letter with a reference needs.
 *
 * Millimetres are the standard's unit and points are pdfmake's, so every constant below is
 * named in the standard's terms and converted once.
 */
const MM = 72 / 25.4;

/** Form B, from the standard. The left margin is what makes the window line up. */
const LEFT = 24.1 * MM;
const RIGHT = 20 * MM;
const TOP = 20 * MM;
const BOTTOM = 20 * MM;
/** The address field begins 45mm down the page in form B, and is 85mm wide. */
const ADDRESS_TOP = 45 * MM;
const ADDRESS_WIDTH = 85 * MM;
/** The return-address line above the recipient, which the standard sets at 5mm. */
const RETURN_HEIGHT = 5 * MM;
/** The subject sits 98.46mm down in form B; the body follows two lines later. */
const SUBJECT_TOP = 98.46 * MM;

export class LetterLayout {
  /**
   * @param {Object} letter - A CoverLetter
   * @param {Object} options - `{ identity, format, theme, typography, t, locale }`
   * @returns {Object} A pdfmake document definition
   */
  compose(letter, { identity, format, theme, typography, t, locale = 'en' } = {}) {
    const bodyWidth = format.width - LEFT - RIGHT;

    return {
      pageSize: { width: format.width, height: format.height },
      pageMargins: [LEFT, TOP, RIGHT, BOTTOM],
      info: {
        title: `${identity.name} — ${letter.subject || t('cv:letter.subject')}`,
        author: identity.name
      },
      ...typography,
      content: [
        this.sender(identity, theme),
        this.addressBlock(letter, identity, theme, bodyWidth),
        this.dateLine(letter, identity, theme, locale),
        this.subjectLine(letter, theme, t),
        ...this.bodyBlocks(letter, theme, t),
        this.closing(letter, identity, theme, t),
        ...this.attachments(letter, theme, t)
      ]
    };
  }

  /**
   * The sender, above the address field.
   *
   * Small and grey on purpose: it is there so the letter can be returned, not so it can be
   * read. The standard gives it a single 5mm line.
   */
  sender(identity, theme) {
    const parts = [identity.name, identity.location, identity.email, identity.phone].filter(
      Boolean
    );
    return {
      text: parts.join(' · '),
      fontSize: 7.5,
      color: theme.muted,
      decoration: 'underline',
      decorationColor: theme.soft,
      margin: [0, ADDRESS_TOP - TOP - RETURN_HEIGHT, 0, 3]
    };
  }

  /**
   * Who the letter is for.
   *
   * Every line the data wrote, and no line it did not: a letter addressed to a company with no
   * name on it is a letter addressed to nobody, and the model reports that rather than filling
   * it in. Nothing here invents a recipient.
   */
  addressBlock(letter, identity, theme, bodyWidth) {
    const lines = [
      letter.recipient.company,
      letter.recipient.name,
      letter.recipient.role,
      ...letter.recipient.address
    ].filter(Boolean);

    return {
      columns: [
        { width: ADDRESS_WIDTH, stack: lines.map((line) => ({ text: line })), color: theme.ink },
        { width: bodyWidth - ADDRESS_WIDTH, text: '' }
      ],
      margin: [0, 0, 0, 0]
    };
  }

  /**
   * The date, right-aligned, with the reference beneath it.
   *
   * `Intl` formats it, never a hand-written pattern: `AGENTS.md` gives dates to `Intl` and a
   * German letter dated in American order is a letter that was not written for its reader.
   */
  dateLine(letter, identity, theme, locale) {
    const stack = [];
    if (letter.date) {
      const parsed = new Date(letter.date);
      const formatted = Number.isNaN(parsed.valueOf())
        ? letter.date
        : new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }).format(parsed);
      stack.push({
        text: [identity.location, formatted].filter(Boolean).join(', '),
        alignment: 'right'
      });
    }
    if (letter.reference) {
      stack.push({ text: letter.reference, alignment: 'right', style: 'meta' });
    }
    return { stack, margin: [0, SUBJECT_TOP - ADDRESS_TOP - 40, 0, 12] };
  }

  /** The one line a reader decides on. Bold, and never longer than the measure. */
  subjectLine(letter, theme, t) {
    return {
      text: letter.subject || t('cv:letter.subject'),
      bold: true,
      color: theme.ink,
      margin: [0, 0, 0, 14]
    };
  }

  /**
   * The salutation, the opening, the body.
   *
   * The salutation's wording comes from the catalogue and the name from the model: the domain
   * says who is addressed and never how, so a German letter opens the way a German letter does.
   */
  bodyBlocks(letter, theme, t) {
    const salutation = letter.addressee
      ? `${t('cv:letter.salutationNamed')} ${letter.addressee},`
      : `${t('cv:letter.salutationAnonymous')},`;

    return [
      { text: salutation, margin: [0, 0, 0, 10] },
      ...[letter.opening, ...letter.body]
        .filter(Boolean)
        .map((paragraph) => ({ text: paragraph, alignment: 'left', margin: [0, 0, 0, 8] }))
    ];
  }

  /** The close, a gap where a signature goes, and the name under it. */
  closing(letter, identity, theme, t) {
    return {
      stack: [
        ...(letter.closing ? [{ text: letter.closing, margin: [0, 4, 0, 10] }] : []),
        { text: t('cv:letter.closing'), margin: [0, 0, 0, 34] },
        { text: letter.signature || identity.name, color: theme.ink }
      ],
      // The whole close travels together: a name orphaned onto a second page is the one
      // pagination failure a reader always notices.
      unbreakable: true
    };
  }

  /** What travels with the letter, named so a reader can tell whether it arrived. */
  attachments(letter, theme, t) {
    if (!letter.attachments.length) return [];
    return [
      {
        text: `${t('cv:letter.attachments')}: ${letter.attachments.join(', ')}`,
        style: 'meta',
        margin: [0, 24, 0, 0]
      }
    ];
  }
}

import { CoverLetter } from '../domain/CoverLetter.js';
import { CvDocument } from '../domain/CvDocument.js';
import { PlaceLexicon } from '../domain/PlaceLexicon.js';

/**
 * The words of a cover letter, in the order a reader meets them (#151).
 *
 * The letter is a page printed by Chrome, as the CV is, and two readers need its words: `letter.html`, which
 * writes them, and the print audit, which checks that they reached the paper in that order. Both ask here, so
 * the audit cannot expect a sentence the page never wrote. pdfmake's `adapters/LetterLayout.js` made the same
 * decisions beside its geometry in points; it stays, unused, until pdfmake goes (#153).
 *
 * What is decided here is what the letter says, never how it looks: the geometry of DIN 5008 is `letter.css`'s.
 * Nothing is invented. A recipient line the data does not write is not printed, a letter the data does not date
 * is not dated, and the wording of a salutation, a closing or an attachments line is the catalogue's.
 */
export class LetterContent {
  /**
   * Whether a profile carries a letter at all. The published CV does not.
   * @param {object} data - The profile
   * @returns {boolean} Whether there is a letter to print
   */
  static has(data) {
    return Boolean(data && data.letter && Object.keys(data.letter).length);
  }

  /**
   * @param {object} data - The profile, its `letter` included
   * @param {{ t: (key: string) => string, locale: string }} options - The catalogue and the letter's language
   * @returns {{ title: string, notice: string, letter: object|null }} The document's title, and either the
   *   letter's words or, for a profile without one, the notice the page shows instead
   */
  static of(data, { t, locale = 'en' }) {
    if (!LetterContent.has(data)) {
      const notice = t('ui:letter.absent');
      return { title: notice, notice, letter: null };
    }

    const letter = new CoverLetter(data.letter);
    const { identity } = new CvDocument(data);
    const name = identity.name || '';
    const subject = letter.subject || t('cv:letter.subject');

    return {
      title: [name, subject].filter(Boolean).join(' — '),
      notice: '',
      letter: {
        sender: {
          name,
          contact: joined([identity.location, identity.email, identity.phone])
        },
        // In the address field above the recipient, where a postal sender belongs; the email and the phone are in the
        // letterhead already.
        returnAddress: joined([name, identity.location]),
        recipient: [
          letter.recipient.company,
          letter.recipient.name,
          letter.recipient.role,
          ...letter.recipient.address
        ].filter(Boolean),
        date: dateLine(letter.date, identity.location, locale),
        reference: letter.reference,
        subject,
        salutation: letter.addressee
          ? `${t('cv:letter.salutationNamed')} ${letter.addressee},`
          : `${t('cv:letter.salutationAnonymous')},`,
        paragraphs: [letter.opening, ...letter.body].filter(Boolean),
        closingSentence: letter.closing,
        closing: t('cv:letter.closing'),
        signature: letter.signature || name,
        attachments: letter.attachments.length
          ? `${t('cv:letter.attachments')}: ${letter.attachments.join(', ')}`
          : ''
      }
    };
  }
}

/** The parts present, joined the way a letterhead joins them. */
function joined(parts) {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' · ');
}

/**
 * The place and the date, as a German reader expects them: the city alone, since the region and the country are in
 * the letterhead (#36), and the date formatted by `Intl`, never by hand. A letter the data does not date is not dated.
 *
 * Only a bare calendar date, `2026-09-16`, is formatted, built from its own year, month and day and formatted in UTC,
 * so it is that day in every zone. Anything else is printed exactly as the data wrote it, and never handed to
 * `Date`'s parser: that reads "September 16, 2026" as midnight where the build runs and a time at +02:00 in UTC, and
 * printed the 15th for both (the review of #151). A date that does not exist, such as 2026-02-30, is not a date.
 */
function dateLine(date, location, locale) {
  if (!date) return '';
  const day = calendarDate(date);
  const formatted = day
    ? new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
      }).format(day)
    : date;
  return [PlaceLexicon.cityOf(location), formatted].filter(Boolean).join(', ');
}

/** The instant a bare `YYYY-MM-DD` names at midnight UTC, or null for anything else, a day that does not exist included. */
function calendarDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  return instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
    ? instant
    : null;
}

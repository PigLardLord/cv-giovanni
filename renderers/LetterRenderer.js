import { BaseRenderer } from './BaseRenderer.js';

/**
 * The cover letter, written into `letter.html` for Chrome to print (#151).
 *
 * The words are `core/LetterContent.js`'s, decided before they arrive; this writes them as text, never as markup,
 * since a letter is typed by a person or tailored by a model (#157). It writes them in the order a reader meets
 * them, one block of DIN 5008 form B after another, because the printed text layer gives them in the order the
 * page draws them: the letterhead, the return line and the recipient, the date and reference, the subject, the
 * salutation, the paragraphs, the close and the attachments. `letter.css` gives each block its height in
 * millimetres; every block is written even when the data leaves it empty, so the next one still starts where
 * the standard puts it.
 */
export class LetterRenderer extends BaseRenderer {
  /**
   * @param {Document} root - The page
   * @param {{ title: string, notice: string, letter: object|null }} content - From `LetterContent.of`
   */
  render(root, content) {
    const container = this.getElement(root, 'letter');
    if (!container) return;
    container.textContent = '';
    if (content?.title) root.title = content.title;

    const letter = content?.letter;
    if (!letter) {
      const notice = this.line(root, 'p', 'letter-notice', content?.notice);
      if (notice) container.appendChild(notice);
      return;
    }

    // The print waits for the candidate's name in this element (scripts/lib/page-ready.mjs).
    const name = this.line(root, 'h1', 'letter-name', letter.sender.name);
    if (name) name.id = 'letter-name';
    const head = this.block(root, 'header', 'letter-head', [
      name,
      this.line(root, 'p', 'letter-contact', letter.sender.contact)
    ]);

    // Form B's address field in its two zones: the remarks zone, which holds the return line at its foot, and the
    // address zone, which holds the recipient.
    const addressField = this.block(root, 'div', 'letter-window', [
      this.block(root, 'div', 'letter-remarks', [
        this.line(root, 'p', 'letter-return', letter.returnAddress)
      ]),
      this.block(
        root,
        'div',
        'letter-recipient',
        letter.recipient.map((recipientLine) => this.line(root, 'p', 'letter-line', recipientLine))
      )
    ]);

    const dateline = this.block(root, 'div', 'letter-dateline', [
      this.line(root, 'p', 'letter-date', letter.date),
      this.line(root, 'p', 'letter-reference', letter.reference)
    ]);

    const paragraphs = letter.paragraphs.map((paragraph) =>
      this.setProse(root, this.createElement(root, 'p', 'letter-paragraph'), paragraph)
    );

    // The close travels together: a signature orphaned onto a second page is the one break a reader always sees.
    const close = this.block(root, 'div', 'letter-close', [
      letter.closingSentence
        ? this.setProse(
            root,
            this.createElement(root, 'p', ['letter-paragraph', 'letter-closing-sentence']),
            letter.closingSentence
          )
        : null,
      this.line(root, 'p', 'letter-closing', letter.closing),
      this.line(root, 'p', 'letter-signature', letter.signature)
    ]);

    [
      head,
      addressField,
      dateline,
      this.line(root, 'h2', 'letter-subject', letter.subject),
      this.line(root, 'p', 'letter-salutation', letter.salutation),
      ...paragraphs,
      close,
      this.line(root, 'p', 'letter-attachments', letter.attachments)
    ]
      .filter(Boolean)
      .forEach((node) => container.appendChild(node));
  }

  /**
   * One line of the letter, as text, or nothing for a line the words leave empty.
   * @returns {Element|null} The element, or null
   */
  line(root, tag, className, words) {
    if (!words) return null;
    const element = this.createElement(root, tag, className);
    element.textContent = words;
    return element;
  }

  /**
   * A block of the form, holding whichever of its lines exist. Written even when it holds none.
   * @returns {Element} The block
   */
  block(root, tag, className, children) {
    const element = this.createElement(root, tag, className);
    children.filter(Boolean).forEach((child) => element.appendChild(child));
    return element;
  }
}

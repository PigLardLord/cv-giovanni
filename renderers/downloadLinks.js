/**
 * Offers the PDF from the Download link on the page, or hides it (#59).
 *
 * The page carries one link, at the top (#150), and a link left visible for a file that does not exist would
 * 404. Which file exists is decided in core, by `CvFiles.isAvailable`; this only applies that decision to the
 * `[data-download-pdf]` element.
 * @param {Document} root - The page
 * @param {{ href: string, filename: string } | null} offer - The file to offer, or null when there is none
 */
export function offerDownload(root, offer) {
  for (const link of root.querySelectorAll('[data-download-pdf]')) {
    link.hidden = !offer;
    if (offer) {
      link.href = offer.href;
      link.download = offer.filename;
    }
  }
}

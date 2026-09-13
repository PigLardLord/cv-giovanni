/**
 * Offers the PDF from every Download link on the page, or hides them all (#59).
 *
 * Nerd Mode carries the link twice, at the end of the toolbar and in the footer, and a copy left visible
 * for a file that does not exist would 404. Which file exists is decided in core, by
 * `PdfExporter.isAvailable`; this only applies that decision to the elements.
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

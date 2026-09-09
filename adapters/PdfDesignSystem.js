/**
 * The type scale.
 *
 * The old scale ran 9 → 12pt, a range of 1.2, and leaned on size alone for hierarchy. It could
 * not lean on weight: pdfmake's stock family maps `bold` to Roboto Medium, one notch above the
 * body. So the steps here are bought with position, tracking and colour as much as with size —
 * and the floor stays at 9pt, below which print taxes exactly the readers doing the hiring.
 */
export class PdfDesignSystem {
  constructor({ fontFamily = 'Inter' } = {}) {
    this.fontFamily = fontFamily;
  }

  resolve(theme) {
    return {
      defaultStyle: { font: this.fontFamily, fontSize: 9.3, color: theme.body, lineHeight: 1.4 },
      styles: {
        name: { fontSize: 30, bold: true, color: theme.ink },
        role: { fontSize: 12.5, bold: true, color: theme.signal, characterSpacing: 0.4 },
        // The section label lives in the rail, not above the block: it costs no vertical space
        // and becomes a map of the document down the left edge.
        section: { fontSize: 9.5, bold: true, color: theme.ink },
        itemTitle: { fontSize: 11.5, bold: true, color: theme.ink },
        employer: { fontSize: 9.5, bold: true, color: theme.body },
        meta: { fontSize: 9, color: theme.muted, lineHeight: 1.4 }
      }
    };
  }
}

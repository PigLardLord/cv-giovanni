export class PdfDesignSystem {
  constructor({ fontFamily = 'Roboto' } = {}) {
    this.fontFamily = fontFamily;
  }

  resolve(theme) {
    return {
      defaultStyle: { font: this.fontFamily, fontSize: 8.7, color: '#334155', lineHeight: 1.25 },
      styles: {
        name: { fontSize: 25, bold: true, color: theme.primary },
        role: { fontSize: 12, bold: true, color: theme.accent, characterSpacing: 0.5 },
        section: { fontSize: 11, bold: true, color: theme.primary, margin: [0, 12, 0, 6] },
        itemTitle: { fontSize: 10.5, bold: true, color: theme.primary },
        meta: { fontSize: 8.2, color: '#64748B' }
      }
    };
  }
}

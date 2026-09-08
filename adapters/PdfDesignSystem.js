export class PdfDesignSystem {
  constructor({ fontFamily = 'Roboto' } = {}) {
    this.fontFamily = fontFamily;
  }

  resolve(theme) {
    return {
      defaultStyle: { font: this.fontFamily, fontSize: 9.2, color: '#334155', lineHeight: 1.4 },
      styles: {
        name: { fontSize: 25, bold: true, color: theme.primary },
        role: { fontSize: 12, bold: true, color: theme.accent, characterSpacing: 0.5 },
        section: { fontSize: 11, bold: true, color: theme.primary, margin: [0, 9, 0, 5] },
        itemTitle: { fontSize: 10.5, bold: true, color: theme.primary },
        meta: { fontSize: 9, color: '#64748B' }
      }
    };
  }
}

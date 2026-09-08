const FORMATS = {
  A4: { name: 'A4', width: 595.28, height: 841.89 },
  LETTER: { name: 'LETTER', width: 612, height: 792 }
};

export class PageFormat {
  resolve(name = 'A4') {
    const normalized = String(name).toUpperCase();
    if (!FORMATS[normalized]) throw new Error(`Unsupported page format: ${name}`);
    return FORMATS[normalized];
  }

  supported() {
    return Object.keys(FORMATS);
  }
}

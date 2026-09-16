/**
 * The height of a font's line box per point of size, as pdfkit sizes a line for pdfmake (`font.lineHeight(size)`):
 * the ascender less the descender, over the units per em, with no line gap.
 *
 * The PDF audit counts the room a page has left in body lines. Counting a page's lines to find its body type picked a
 * heading on a sparse page, and would pick the labels on a page of labels (#124). The font and the size the document
 * was set in say it exactly: Inter at 9.3pt sets a line box 11.2526pt tall, which is what pdftotext measures.
 * @param {Uint8Array} font - A TrueType or OpenType font file
 * @returns {number} Points of line box per point of size
 * @throws {Error} When the file has no `head` or no `hhea` table
 */
export function lineBox(font) {
  const bytes = Buffer.from(font);
  const tables = new Map();
  const count = bytes.readUInt16BE(4);
  for (let index = 0; index < count; index++) {
    const record = 12 + 16 * index;
    tables.set(bytes.toString('latin1', record, record + 4), bytes.readUInt32BE(record + 8));
  }
  if (!tables.has('head') || !tables.has('hhea')) {
    throw new Error('Not a font with head and hhea tables.');
  }
  const unitsPerEm = bytes.readUInt16BE(tables.get('head') + 18);
  const ascender = bytes.readInt16BE(tables.get('hhea') + 4);
  const descender = bytes.readInt16BE(tables.get('hhea') + 6);
  return (ascender - descender) / unitsPerEm;
}

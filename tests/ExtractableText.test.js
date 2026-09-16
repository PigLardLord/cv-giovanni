import { gluedPhrases, type3Fonts } from '../scripts/lib/extractable-text.mjs';

// The browser's print embedded Inter as Type 3 fonts, and its headings came out of the text layer with no
// spaces between their words when it was read in drawing order, as PDFBox and Tika read by default:
// "MobileSoftwareEngineer", "GiovanniTrovato" (#143). Measured with `pdffonts` and `pdftotext -raw`.
describe('fonts a text extractor can read', () => {
  const pdffonts = (...rows) =>
    [
      'name                                 type              encoding         emb sub uni object ID',
      '------------------------------------ ----------------- ---------------- --- --- --- ---------',
      ...rows
    ].join('\n');

  test('names every Type 3 font the page embeds', () => {
    expect(
      type3Fonts(
        pdffonts(
          'AAAAAA+Inter-Regular                 Type 3            Custom           yes yes yes     13  0',
          'BAAAAA+Inter-Bold                    CID TrueType      Identity-H       yes yes yes     14  0',
          'CAAAAA+NotoColorEmoji                Type 3            Custom           yes yes yes     19  0'
        )
      )
    ).toEqual(['AAAAAA+Inter-Regular', 'CAAAAA+NotoColorEmoji']);
  });

  // The code review of #156: the name was cut at its first space, and a name holding "Type 3" could be taken for the type.
  test('reads the name and the type from their own columns', () => {
    expect(
      type3Fonts(
        pdffonts(
          'BAAAAA+Liberation Serif              Type 3            Custom           yes yes yes     14  0',
          'CAAAAA+Type 3 Sans                   CID TrueType      Identity-H       yes yes yes     15  0'
        )
      )
    ).toEqual(['BAAAAA+Liberation Serif']);
  });

  // The review of that fix: pdffonts pads a name to 36 characters but never cuts a longer one, so every column
  // after it shifts right, and a header-positioned read missed the Type 3 font.
  test('finds a Type 3 font whose name runs past its column', () => {
    const row = (name, type, encoding) =>
      `${name.padEnd(36)} ${type.padEnd(17)} ${encoding.padEnd(16)} yes yes no  ${'5'.padStart(6)} ${'0'.padStart(2)}`;

    expect(
      type3Fonts(
        pdffonts(
          row('AAAAAA+SomeVeryLongCondensedFamily-BoldItalic', 'Type 3', 'Custom'),
          row('BAAAAA+Inter-Regular', 'CID TrueType', 'Identity-H')
        )
      )
    ).toEqual(['AAAAAA+SomeVeryLongCondensedFamily-BoldItalic']);
  });

  // The review of that fix: any column can widen, not only the name. An object number of seven digits, a
  // generation over 99 or an encoding past 16 characters moved the type away from its distance to the row's end.
  test('finds a Type 3 font whichever column widens', () => {
    const rows = [
      'AAAAAA+Inter-Regular                 Type 3            Custom           yes yes yes  9999999  0',
      'BAAAAA+Inter-Bold                    Type 3            Custom           yes yes yes       6 100',
      'CAAAAA+Legacy                        Type 3            MacExpertEncoding yes yes no        7  0',
      'DAAAAA+Type 3 Sans                   CID TrueType      Identity-H       yes yes yes       8  0'
    ];

    expect(type3Fonts(pdffonts(...rows))).toEqual([
      'AAAAAA+Inter-Regular',
      'BAAAAA+Inter-Bold',
      'CAAAAA+Legacy'
    ]);
  });

  test('a page set in TrueType fonts has none', () => {
    expect(
      type3Fonts(
        pdffonts(
          'AAAAAA+Inter-Bold                    CID TrueType      Identity-H       yes yes yes     13  0'
        )
      )
    ).toEqual([]);
  });
});

describe('phrases that keep their word spaces in drawing order', () => {
  const phrases = ['Giovanni Trovato', 'Mobile Software Engineer / Technical Owner, iOS & Android'];

  test('names a phrase whose words run together', () => {
    const raw = 'GiovanniTrovato\nMobileSoftwareEngineer/TechnicalOwner,iOS&Android\n';

    expect(gluedPhrases(raw, phrases)).toEqual(phrases);
  });

  test('names a phrase that lost a single space, not only one that lost them all', () => {
    expect(
      gluedPhrases(
        'Giovanni Trovato\nMobile SoftwareEngineer / Technical Owner, iOS & Android',
        phrases
      )
    ).toEqual(['Mobile Software Engineer / Technical Owner, iOS & Android']);
  });

  test('passes a phrase whose words are spaced, or broken across lines', () => {
    const raw = 'Giovanni Trovato\nMobile Software Engineer / Technical\nOwner, iOS & Android';

    expect(gluedPhrases(raw, phrases)).toEqual([]);
  });

  test('leaves a phrase the text does not carry to the content check', () => {
    expect(gluedPhrases('Nothing here', phrases)).toEqual([]);
  });
});

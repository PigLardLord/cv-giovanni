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

import { pdfVariant } from '../scripts/lib/pdf-variant.mjs';

describe('the paper and the kind of document a generated PDF is, read from the end of its name', () => {
  test.each([
    ['giovanni-trovato-general-en-nerd-a4-color.pdf', { paper: 'a4', coverLetter: false }],
    [
      'giovanni-trovato-general-en-spotlight-letter-monochrome.pdf',
      { paper: 'letter', coverLetter: false }
    ],
    ['giovanni-trovato-general-en-nerd-cover-a4-color.pdf', { paper: 'a4', coverLetter: true }],
    [
      'giovanni-trovato-general-en-technical-cover-letter-monochrome.pdf',
      { paper: 'letter', coverLetter: true }
    ]
  ])('%s', (filename, variant) => {
    expect(pdfVariant(filename)).toEqual(variant);
  });

  // A profile's name comes first in the filename, and it can be made of the very words the variant is
  // made of. Measured: an application named zz-letter failed the format check on every A4 file (#79).
  test.each([
    ['giovanni-trovato-zz-letter-en-nerd-a4-color.pdf', { paper: 'a4', coverLetter: false }],
    [
      'giovanni-trovato-zz-letter-en-nerd-cover-a4-monochrome.pdf',
      { paper: 'a4', coverLetter: true }
    ],
    [
      'giovanni-trovato-cover-letter-en-spotlight-a4-color.pdf',
      { paper: 'a4', coverLetter: false }
    ],
    [
      'giovanni-trovato-cover-en-technical-letter-color.pdf',
      { paper: 'letter', coverLetter: false }
    ]
  ])('a profile named with those words changes nothing: %s', (filename, variant) => {
    expect(pdfVariant(filename)).toEqual(variant);
  });

  test('a name that does not end in a paper and a colour mode is refused, not guessed', () => {
    expect(() => pdfVariant('giovanni-trovato-general-en-nerd.pdf')).toThrow(
      /giovanni-trovato-general-en-nerd\.pdf/
    );
  });
});

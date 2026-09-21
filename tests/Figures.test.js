import { figurePieces, figuresIn } from '../domain/Figures.js';

// What a figure is, in a line of the CV: the rule the renderers read to set Selected Impact's figures in Bold (#261),
// so no renderer guesses from digits.
describe('a figure', () => {
  test.each([
    [
      'Cortado MDM for iOS: ~30k downloads, 4 App Store Connect crash reports since 2021',
      ['~30k', '4']
    ],
    ['ezeep Blue for iOS: ~300k downloads since its 2020 release', ['~300k']],
    [
      'Cortado MDM for Android, 2026: 1040 → 5308 tests, branch coverage 14% → 83%',
      ['1040 → 5308', '14% → 83%']
    ],
    ['Cortado MDM für iOS: rund 30.000 Downloads, 4 Absturzberichte seit 2021', ['30.000', '4']],
    ['Cortado MDM für Android: 1.040 → 5.308 Tests', ['1.040 → 5.308']],
    ['<0.1% crashes, 11+ years, from 37.7 to 5,2 minutes', ['<0.1%', '11+', '37.7', '5,2']]
  ])('in "%s" is %j', (line, figures) => {
    expect(figuresIn(line)).toEqual(figures);
  });

  test('is never a year standing alone, nor part of a name', () => {
    expect(figuresIn('since 2021, in 2020, on iOS17 and v2.0, B2B, Swift 6')).toEqual(['6']);
  });

  test('leaves the line whole: its pieces, joined, are the line as written', () => {
    const line = 'Cortado MDM for Android, 2026: 1040 → 5308 tests, branch coverage 14% → 83%';

    expect(
      figurePieces(line)
        .map(({ text }) => text)
        .join('')
    ).toBe(line);
    expect(figurePieces('no figure here')).toEqual([{ text: 'no figure here', figure: false }]);
  });
});

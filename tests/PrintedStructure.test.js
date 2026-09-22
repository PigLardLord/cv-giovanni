/**
 * @jest-environment node
 */
import { treeFindings } from '../scripts/lib/printed-structure.mjs';

// Chrome tagged emphasis as Strong, a type PDF 1.4 does not have, and poppler-based readers dropped it from the tree
// with its text: structurally, Selected Impact read "Cortado MDM for iOS: [ ] downloads" (#370). The print audit reads
// the tree as such a reader does.
describe('what a reader walking the structure tree meets', () => {
  const figures = ['~30k', '14% → 83%'];

  test('a tree poppler reads whole, holding every figure, has nothing to say', () => {
    expect(
      treeFindings(
        {
          output:
            'LI\n  "Cortado MDM for iOS: ~30k downloads"\nLI\n  "branch coverage 14% → 83%"\n',
          errors: ''
        },
        figures
      )
    ).toEqual({ wrongTypes: [], missing: [] });
  });

  test('names each element poppler rejected, once, and each figure the tree lost', () => {
    expect(
      treeFindings(
        {
          output:
            'LI\n  "Cortado MDM for iOS: "\n  " downloads"\nLI\n  "branch coverage 14% → 83%"\n',
          errors: [
            'Syntax Error: StructElem object is wrong type (Strong)',
            'Syntax Error: StructElem object is wrong type (Strong)'
          ].join('\n')
        },
        figures
      )
    ).toEqual({
      wrongTypes: ['Syntax Error: StructElem object is wrong type (Strong)'],
      missing: ['~30k']
    });
  });

  // The review of #371: read across the whole tree with its spaces taken out, "4" was always found — in a phone number,
  // in "4 months", inside "14%" and "1040" — and its loss could not be seen. A figure is read whole, in its section.
  test('finds a figure only whole, and only in its section', () => {
    const tree = [
      'H3',
      '  "Selected Impact"',
      'LI',
      '  "Cortado MDM for iOS: "',
      '  "~30k"',
      '  " downloads, "',
      '  " App Store Connect crash reports since 2021"',
      'LI',
      '  "Cortado MDM for Android, 2026: "',
      '  "1040 → 5308"',
      '  " tests, branch coverage "',
      '  "14% → 83%"',
      'H3',
      '  "Professional Experience"',
      '  "(4 years, 7 months) +39 329 8484 046"'
    ].join('\n');
    const section = { from: 'Selected Impact', to: 'Professional Experience' };

    expect(
      treeFindings({ output: tree, errors: '' }, ['~30k', '4', '1040 → 5308', '14% → 83%'], section)
        .missing
    ).toEqual(['4']);
  });

  test('a section the tree does not hold loses every figure', () => {
    expect(
      treeFindings({ output: '"~30k"', errors: '' }, ['~30k'], {
        from: 'Selected Impact',
        to: 'Professional Experience'
      }).missing
    ).toEqual(['~30k']);
  });

  test('reads a figure across the spaces the tree breaks it with', () => {
    expect(
      treeFindings({ output: '"14%"\n" → "\n"83%"', errors: '' }, ['14% → 83%']).missing
    ).toEqual([]);
  });
});

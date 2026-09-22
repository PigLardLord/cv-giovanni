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

  test('reads a figure across the spaces the tree breaks it with', () => {
    expect(
      treeFindings({ output: '"14%"\n" → "\n"83%"', errors: '' }, ['14% → 83%']).missing
    ).toEqual([]);
  });
});

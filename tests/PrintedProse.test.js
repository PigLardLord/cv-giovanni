/**
 * @jest-environment node
 */
import {
  printedPages,
  proseSpans,
  rolePages,
  straddlingRoles
} from '../scripts/lib/printed-prose.mjs';

// What a sentence costs on paper is not what it costs in the profile: the same bullet is set over two lines in one
// layout and four in another, and only the printed artefact says which (#230). These are the measurements the print
// audit fails a bullet, a summary and a split role on.
const page1 = [
  'Giovanni Trovato',
  'Professional Experience',
  'iOS Developer at Cortado Mobile Solutions, Berlin (remote)',
  'August 2018 – Present (8 years, 1 month)',
  'Enterprise mobility and device management, in a mobile team of 2',
  'since 2020.',
  'Cortado MDM for iOS: built in SwiftUI from the first commit, on'
].join('\n');
const page2 = ['Clean Architecture and TDD.', 'Mobile Developer at Apparound, Pisa, Italy'].join(
  '\n'
);
const printed = `${page1}\f${page2}`;

describe('what a sentence costs on the printed page', () => {
  test('a page is its lines, with the whitespace squashed', () => {
    expect(
      printedPages('One line\n  spaced  out \n\fSecond page').map(({ lines }) => lines)
    ).toEqual([['One line', 'spaced out'], ['Second page']]);
  });

  test('a sentence set over two lines is two lines, and one set over one is one', () => {
    expect(
      proseSpans(printed, [
        'Enterprise mobility and device management, in a mobile team of 2 since 2020.',
        'Giovanni Trovato'
      ])
    ).toEqual([
      {
        text: 'Enterprise mobility and device management, in a mobile team of 2 since 2020.',
        found: true,
        page: 1,
        lines: 2,
        pages: [1]
      },
      { text: 'Giovanni Trovato', found: true, page: 1, lines: 1, pages: [1] }
    ]);
  });

  test('a sentence the print does not hold is reported as unfound, never as fitting', () => {
    expect(proseSpans(printed, ['A bullet nobody printed.'])).toEqual([
      { text: 'A bullet nobody printed.', found: false, page: null, lines: null, pages: [] }
    ]);
  });

  test("a sentence poppler joined to Nerd Mode's date column is read without the dates", () => {
    const nerd = 'August 2018 – Present Enterprise mobility and device\nmanagement.';

    expect(
      proseSpans(nerd, ['Enterprise mobility and device management.'], {
        periods: ['August 2018 – Present (8 years, 1 month)']
      })
    ).toEqual([
      {
        text: 'Enterprise mobility and device management.',
        found: true,
        page: 1,
        lines: 2,
        pages: [1]
      }
    ]);
  });

  test('a role is found by the line naming both its title and its employer', () => {
    expect(
      rolePages(printed, [
        {
          title: 'iOS Developer',
          company: 'Cortado Mobile Solutions',
          prose: ['Enterprise mobility and device management, in a mobile team of 2 since 2020.']
        }
      ])
    ).toEqual([
      { title: 'iOS Developer', company: 'Cortado Mobile Solutions', header: 1, pages: [1] }
    ]);
  });

  test('a role whose bullet runs onto the next page straddles the break; one that ends on its page does not', () => {
    const roles = [
      {
        title: 'iOS Developer',
        company: 'Cortado Mobile Solutions',
        prose: [
          'Cortado MDM for iOS: built in SwiftUI from the first commit, on Clean Architecture and TDD.'
        ]
      },
      {
        title: 'Mobile Developer',
        company: 'Apparound',
        prose: []
      }
    ];

    expect(straddlingRoles(printed, roles)).toEqual([
      { title: 'iOS Developer', company: 'Cortado Mobile Solutions', header: 1, pages: [1, 2] }
    ]);
  });
});

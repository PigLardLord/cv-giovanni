/**
 * @jest-environment node
 */
import {
  printedPages,
  proseSpans,
  raggedMasthead,
  rolePages,
  straddlingRoles,
  strandedSeparators
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
        pages: [1],
        last: expect.any(String)
      },
      {
        text: 'Giovanni Trovato',
        found: true,
        page: 1,
        lines: 1,
        pages: [1],
        last: 'Giovanni Trovato'
      }
    ]);
  });

  test('a sentence the print does not hold is reported as unfound, never as fitting', () => {
    expect(proseSpans(printed, ['A bullet nobody printed.'])).toEqual([
      {
        text: 'A bullet nobody printed.',
        found: false,
        page: null,
        lines: null,
        pages: [],
        last: null
      }
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
        pages: [1],
        last: 'management.'
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

  // One line of the masthead started 2.8pt — a 10pt space — to the right of every other, because the contact line's
  // first hidden label left its space behind and no separator was drawn in its place (#230).
  test('a masthead line that starts past the page edge is named, and the heading below it is not read', () => {
    const extract = [
      '<page width="595" height="842">',
      '<line xMin="95.2" yMin="31" xMax="295" yMax="60"><word xMin="95.2" xMax="295">Giovanni Trovato</word></line>',
      '<line xMin="98.0" yMin="105" xMax="300" yMax="118"><word xMin="98.0" xMax="300">ada@example.com</word></line>',
      '<line xMin="95.2" yMin="130" xMax="200" yMax="145"><word xMin="95.2" xMax="200">Selected Impact</word></line>',
      '<line xMin="108.2" yMin="150" xMax="300" yMax="165"><word xMin="108.2" xMax="300">An indented bullet</word></line>',
      '</page>'
    ].join('\n');

    expect(raggedMasthead(extract, { until: 'Selected Impact' })).toEqual([
      { left: 98, edge: 95.2, text: 'ada@example.com' }
    ]);
  });

  // A check that cannot find what it measures has not measured it: a layout that printed the title and the employer
  // on two lines left `rolePages` with no header, and the role straddled the break unreported.
  test('a role whose header the print does not hold is reported, not passed over', () => {
    const roles = [{ title: 'Head Chef', company: 'Trattoria', prose: ['Cooked.'] }];

    expect(straddlingRoles('Something else entirely.', roles)).toEqual([
      { title: 'Head Chef', company: 'Trattoria', header: null, pages: [] }
    ]);
  });

  // The contacts' separators are drawn by the stylesheet in the place of a hidden label, so a field the profile
  // leaves out takes its value away and leaves the dot behind (#230).
  test('a masthead line left ending on its separator is found, and the sections below it are not read', () => {
    const printed = [
      'Giovanni Trovato',
      'Bad Liebenstein, Thuringia, Germany ·',
      'Selected Impact',
      'Cortado MDM for iOS ·'
    ].join('\n');

    expect(strandedSeparators(printed, { until: 'Selected Impact' })).toEqual([
      'Bad Liebenstein, Thuringia, Germany ·'
    ]);
  });
});

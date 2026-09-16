/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import {
  MEASURE_LIMIT,
  NERD_DATE_COLUMN,
  bboxLines,
  longProseLines,
  overflowingPeriods,
  proseOf
} from '../scripts/lib/line-length.mjs';

// Nothing measured how long a printed line runs, and WCAG 1.4.8 puts the ceiling at 80 characters. Once the print is
// the only downloadable PDF, a stylesheet change that widens the column again would go unnoticed (#155).
const profile = {
  profile:
    'Senior iOS engineer with 11+ years in native mobile and six years owning an enterprise MDM client.',
  career_highlights: ['75% faster CI'],
  relevant_experience: [
    { summary: 'Enterprise mobility.', description: '', highlights: ['Owned the iOS client.'] }
  ],
  certifications: [{ description: 'Clean Architecture.' }],
  education: [{ description: '' }],
  skills: [{ category: 'iOS', items: [{ name: 'Swift' }] }],
  interests: ['Robotics & IoT']
};

describe('the measure of the printed prose', () => {
  test('prose is the summary, the highlights, and what roles, certificates and degrees say', () => {
    expect(proseOf(profile)).toEqual([
      'Senior iOS engineer with 11+ years in native mobile and six years owning an enterprise MDM client.',
      '75% faster CI',
      'Enterprise mobility.',
      'Owned the iOS client.',
      'Clean Architecture.'
    ]);
  });

  test('names a prose line past 80 characters, with its page', () => {
    const text = [
      'Giovanni Trovato',
      'Senior iOS engineer with 11+ years in native mobile and six years owning an enterprise MDM',
      'client.',
      '\fOwned the iOS client.'
    ].join('\n');

    expect(MEASURE_LIMIT).toBe(80);
    expect(longProseLines(text, proseOf(profile))).toEqual([
      {
        page: 1,
        length: 90,
        line: 'Senior iOS engineer with 11+ years in native mobile and six years owning an enterprise MDM'
      }
    ]);
  });

  // Lists are scanned item by item, not read along a measure: a skill line reaches 84 characters and a contact line 88
  // on the printed CV, and neither is a block of text WCAG 1.4.8 speaks of.
  test('a list line past 80 characters is not prose, and passes', () => {
    const text = `iOS — Swift, SwiftUI, UIKit, Swift Concurrency, XCTest / XCUITest, App Intents, Live Activities\n`;

    expect(longProseLines(text, proseOf(profile))).toEqual([]);
  });

  test('a line of 80 characters is within the measure, and one of 81 is not', () => {
    const eighty = 'x'.repeat(80);
    const prose = [`${eighty}x tail`];

    expect(longProseLines(eighty, prose)).toEqual([]);
    expect(longProseLines(`${eighty}x`, prose)).toEqual([
      { page: 1, length: 81, line: `${eighty}x` }
    ]);
  });
});

describe("Nerd Mode's dates in their column", () => {
  const word = (x0, x1, y, text) =>
    `<word xMin="${x0}" yMin="${y}" xMax="${x1}" yMax="${y + 11}">${text}</word>`;
  /** A line whose words share its width evenly, or end where `ends` says. */
  const line = (x0, x1, y, text, ends = []) => {
    const parts = text.split(' ');
    const right = (index) => ends[index] ?? x0 + ((x1 - x0) * (index + 1)) / parts.length;
    return `<line xMin="${x0}" yMin="${y}" xMax="${x1}" yMax="${y + 11}">${parts
      .map((part, index) => word(index ? right(index - 1) : x0, right(index), y, part))
      .join('')}</line>`;
  };
  const page = (...lines) =>
    `<doc><page width="595.92" height="841.92">${lines.join('')}</page></doc>`;

  test('reads each line of the extract with its left and right edge and its text', () => {
    expect(bboxLines(page(line(39, 164.3, 100, 'September 2015')))).toEqual([
      {
        page: 1,
        left: 39,
        right: 164.3,
        text: 'September 2015',
        words: [
          { text: 'September', right: 101.65 },
          { text: '2015', right: 164.3 }
        ]
      }
    ]);
  });

  test('names a period line that runs past the 128pt column into the gap', () => {
    const extract = page(
      line(39, 164.3, 100, 'September 2015 – July 2018'),
      line(39, 171.2, 120, 'September 2015 – September 2018'),
      line(181, 540, 100, 'Mobile Developer at Apparound, Pisa, Italy')
    );
    const periods = [
      'September 2015 – July 2018 (2 years, 11 months)',
      'September 2015 – September 2018'
    ];

    expect(NERD_DATE_COLUMN).toEqual({ left: 39, width: 128 });
    expect(overflowingPeriods(extract, periods)).toEqual([
      { page: 1, right: 171.2, text: 'September 2015 – September 2018' }
    ]);
  });

  // Poppler sets a period and its role's title on one line where the two share a baseline: only the period's words are
  // held to the column, and the title beside it is not an overflow.
  test('on a line it shares with a title, holds only the period to the column', () => {
    const periods = ['May 2015 – August 2015 4 months'];
    const inside = line(
      39,
      413,
      100,
      'May 2015 – August 2015 Mobile Developer Intern',
      [60, 85, 92, 130, 160, 250, 330, 413]
    );
    const past = line(
      39,
      413,
      100,
      'May 2015 – August 2015 Mobile Developer Intern',
      [60, 85, 92, 150, 175, 250, 330, 413]
    );

    expect(overflowingPeriods(page(inside), periods)).toEqual([]);
    expect(overflowingPeriods(page(past), periods)).toEqual([
      { page: 1, right: 175, text: 'May 2015 – August 2015' }
    ]);
  });

  // The column and the margin are declared beside the check, which reads no CSS, and held to print.css here.
  test('the column is the one print.css declares', () => {
    const css = readFileSync(new URL('../print.css', import.meta.url), 'utf8');
    const [, margin] = /@page\s*\{[^}]*?margin:\s*[\d.]+pt\s+([\d.]+)pt/.exec(css);
    const [, column] =
      /body\[data-layout='nerd'\][^{]*\{[^}]*grid-template-columns:\s*([\d.]+)pt/.exec(css);

    expect(NERD_DATE_COLUMN).toEqual({ left: Number(margin), width: Number(column) });
  });
});

/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { MEASURE_LIMIT, longProseLines, proseOf } from '../scripts/lib/line-length.mjs';

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

  // The code review of #177: with Nerd Mode's date column squeezed, poppler joined "Present", the last word of a period,
  // to an 88-character line of a role's summary, and the joined line was no sentence the profile writes.
  test('finds the prose on a line that begins with the last words of a period', () => {
    const summary =
      'Enterprise mobility and device management (MDM, secure printing) in a mobile team of 3–7 engineers.';
    const line =
      'Present Enterprise mobility and device management (MDM, secure printing) in a mobile team of 3–7';
    const periods = ['August 2018 – Present (8 years, 2 months)'];

    expect(longProseLines(line, [summary])).toEqual([]);
    expect(longProseLines(line, [summary], { periods })).toEqual([
      { page: 1, length: 88, line: line.slice('Present '.length) }
    ]);
  });

  test('a line of prose that begins with a word a period uses is measured whole', () => {
    const sentence = `Present ${'x'.repeat(80)} and more`;
    const line = `Present ${'x'.repeat(80)}`;

    expect(longProseLines(line, [sentence], { periods: ['August 2018 – Present'] })).toEqual([
      { page: 1, length: 88, line }
    ]);
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

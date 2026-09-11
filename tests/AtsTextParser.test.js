/**
 * @jest-environment node
 *
 * The fixtures are read off disk: they are the specification, and a copy inlined here would
 * drift from the one the audit actually runs against.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { DateRange } from '../domain/DateRange.js';

const fixtures = fileURLToPath(new URL('./fixtures/ats/', import.meta.url));
const parse = (name) => AtsTextParser.parse(readFileSync(`${fixtures}${name}.txt`, 'utf8'));

describe('a clean document, as the artefact actually extracts', () => {
  const cv = parse('clean-english');

  test('it segments, in one language', () => {
    expect(cv.segmentation).toBe('ok');
    expect(cv.languages).toEqual(['en']);
    expect(cv.sections.map((section) => section.section)).toEqual([
      'experience',
      'skills',
      'education',
      'languages',
      'certifications'
    ]);
  });

  test('the contacts come back', () => {
    expect(cv.identity.name.value).toBe('Giovanni Trovato');
    expect(cv.identity.title.value).toBe('Senior iOS Engineer / Mobile Platform Owner');
    expect(cv.identity.email.value).toBe('trovato.giovanni@gmail.com');
    expect(cv.identity.phone.value).toBe('+393298484046');
    expect(cv.identity.location.value).toBe('Bad Liebenstein, Thuringia, Germany');
  });

  // The CV is full of numbers that a digit-counting regex would take for a telephone.
  test('no measurement is mistaken for a phone number', () => {
    for (const line of [
      'Expanded the test suite to ~4,800 tests',
      'from 15% to 82%',
      'cutting CI runtime by 75% (32 to 8 minutes)',
      'a mobile team of 3–7 engineers'
    ]) {
      expect(AtsTextParser.phone([line])).toBeNull();
    }
  });

  test('every address is recovered whole', () => {
    expect(cv.identity.addresses.map((address) => address.value)).toEqual([
      'github.com/PigLardLord',
      'linkedin.com/in/piglardlord',
      'piglardlord.github.io/cv-giovanni'
    ]);
  });

  test('the roles come back in order, each with its own employer and period', () => {
    expect(cv.experience.map((role) => role.employer.value)).toEqual([
      'Cortado Mobile Solutions',
      'Apparound',
      'Marte 5'
    ]);
    expect(cv.tripleAdjacent).toBe(true);
    expect(cv.roleOrderMonotonic).toBe(true);
  });

  test('each skill category keeps its own list', () => {
    expect(cv.skills.map((group) => group.category)).toEqual([
      'iOS',
      'Android',
      'Delivery & platform',
      'Architecture & practices'
    ]);
    expect(cv.skills[0].items).toContain('Swift');
    // Split on `,` and `·` only: on `/` this would shatter into halves that are not skills.
    expect(cv.skills[0].items).toContain('XCTest / XCUITest');
  });

  test('a CEFR level is read only where one was written', () => {
    expect(cv.spokenLanguages.map((language) => [language.name, language.cefr])).toEqual([
      ['Italian', null],
      ['English', 'C1'],
      ['German', 'A1']
    ]);
  });
});

describe('the pathological shapes, each failing the check it was written for', () => {
  // Fewer than two headings is not a document with little structure; it is one whose
  // structure did not survive. Reporting the fields anyway would be invention.
  test('no headings: segmentation fails and nothing downstream is claimed', () => {
    const cv = parse('no-headings');

    expect(cv.segmentation).toBe('failed');
    expect(cv.experience).toEqual([]);
    expect(cv.skills).toEqual([]);
    expect(cv.education).toEqual([]);
  });

  test('a dropped header takes the email with it', () => {
    const cv = parse('header-footer-dropped');

    expect(cv.segmentation).toBe('ok');
    expect(cv.identity.email).toBeNull();
  });

  // Columns serialised down one side and then the other put the intern first. Every string
  // is present and the career is nonsense — which no `includes()` check can see.
  test('two columns serialised: the chronology stops running one way', () => {
    const cv = parse('two-column-serialised');

    expect(cv.experience).toHaveLength(3);
    expect(cv.roleOrderMonotonic).toBe(false);
  });

  // One line above the date is not enough to tell a title from an employer, so neither is
  // claimed. A guess here binds the wrong string to the wrong field, invisibly.
  test('a flattened table leaves the role without a title, and none is invented', () => {
    const cv = parse('table-flattened');

    expect(cv.experience).toHaveLength(1);
    expect(cv.experience[0].title).toBeNull();
    expect(cv.experience[0].employer).toBeNull();
    expect(cv.experience[0].tripleAdjacent).toBe(false);
  });

  test('mixed date formats are counted, not smoothed over', () => {
    const cv = parse('mixed-dates');
    const written = cv.experience.map((role) => role.period.raw);

    expect(DateRange.shapes(written)).toBe(3);
  });

  // Everything downstream must work with no English in the document at all.
  test('German labels segment the same document', () => {
    const cv = parse('german-labels');

    expect(cv.languages).toEqual(['de']);
    expect(cv.sections.map((section) => section.section)).toEqual([
      'experience',
      'education',
      'languages'
    ]);
    expect(cv.experience[0].employer.value).toBe('Cortado Mobile Solutions');
    expect(cv.experience[0].period.end).toBe('present');
  });

  // The real defect, before it was fixed: a category torn in half by a wrapping column
  // arrives as two categories and a list belonging to neither.
  test('an orphaned category is recovered as the two categories it became', () => {
    const cv = parse('orphan-category');

    expect(cv.skills.map((group) => group.category)).toEqual([
      'iOS',
      'Architecture &',
      'practices'
    ]);
    expect(cv.skills.map((group) => group.category)).not.toContain('Architecture & practices');
  });
});

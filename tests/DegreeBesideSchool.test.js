/**
 * @jest-environment node
 */
import { degreeBesideSchool } from '../scripts/lib/degree-lines.mjs';

// The print audit's "degree beside its school" (#48): a degree, its school and its period stay together in the text a
// parser reads. A degree that states its credits writes them between the two, "Degree (60 ECTS)", so the check expects
// exactly those words there, in the catalogue's wording and the CV's numbers, and nothing between a degree and its
// school otherwise. The check has to be able to fail, and this is where that is proved.
const words = { credits: '{{count}} ECTS', locale: 'en' };
const pisa = {
  degree: "First Level Professional Master's Programme in Mobile Applications Development",
  school: 'Università degli Studi di Pisa',
  period: '2014 – 2016',
  credits: 60
};
const catania = {
  degree: 'B.Sc. Computer Engineering',
  school: 'Università degli Studi di Catania',
  period: '2009'
};
const beside = (degree, flat, options = words) => degreeBesideSchool(degree, options).test(flat);

describe('a degree beside its school', () => {
  test('a degree with credits reads "Degree (60 ECTS) School (period)"', () => {
    expect(
      beside(
        pisa,
        "First Level Professional Master's Programme in Mobile Applications Development (60 ECTS) Università degli Studi di Pisa (2014 – 2016)"
      )
    ).toBe(true);
  });

  test('a degree whose credits did not print, or printed in other words, is not beside its school as written', () => {
    expect(
      beside(
        pisa,
        "First Level Professional Master's Programme in Mobile Applications Development Università degli Studi di Pisa (2014 – 2016)"
      )
    ).toBe(false);
    expect(
      beside(
        pisa,
        "First Level Professional Master's Programme in Mobile Applications Development (60 credits) Università degli Studi di Pisa (2014 – 2016)"
      )
    ).toBe(false);
  });

  test('a degree with no credits takes its school next, in either form a CV writes it', () => {
    expect(
      beside(catania, 'B.Sc. Computer Engineering Università degli Studi di Catania (2009)')
    ).toBe(true);
    expect(
      beside(catania, 'B.Sc. Computer Engineering Università degli Studi di Catania · 2009')
    ).toBe(true);
    expect(
      beside(
        catania,
        'B.Sc. Computer Engineering (60 ECTS) Università degli Studi di Catania (2009)'
      )
    ).toBe(false);
    expect(
      beside(catania, 'B.Sc. Computer Engineering Languages Università degli Studi di Catania')
    ).toBe(false);
  });

  // A profile may leave a degree's period out, and the page then prints the school alone (#169). The check asked for the
  // period whatever the profile held, and failed a sparse profile on the word "undefined" it never printed (#178).
  test('a degree with no period takes its school next, and nothing is asked after it', () => {
    const undated = { degree: catania.degree, school: catania.school };
    const flat = 'B.Sc. Computer Engineering Università degli Studi di Catania Languages Italian';

    expect(beside(undated, flat)).toBe(true);
    expect(beside({ ...undated, period: null }, flat)).toBe(true);
    expect(beside({ ...undated, period: '  ' }, flat)).toBe(true);
    expect(
      beside(undated, 'B.Sc. Computer Engineering Languages Università degli Studi di Catania')
    ).toBe(false);
  });

  test('the count is written as the CV’s language writes numbers', () => {
    const big = { ...pisa, credits: 1500 };
    const flat = (count) =>
      `${pisa.degree} (${count} ECTS) Università degli Studi di Pisa (2014 – 2016)`;

    expect(beside(big, flat('1.500'), { ...words, locale: 'de' })).toBe(true);
    expect(beside(big, flat('1,500'), { ...words, locale: 'de' })).toBe(false);
  });
});

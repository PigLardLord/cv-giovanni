import {
  certificationLine,
  degreeLine,
  roleHeader,
  schoolLine,
  scopeText
} from '../domain/EntryLines.js';

// A profile edited in the browser can leave out a role's location, a degree's period, or a certification's issuer or
// year. The renderers still wrote the punctuation around the missing field: "Engineer at Acme," and "()" (#169). Which
// separators a line writes is decided from the fields it has, here, and the renderers only lay the pieces out.
const text = (pieces) =>
  pieces.map((piece) => (typeof piece === 'string' ? piece : piece.text)).join('');

describe('the lines an entry writes', () => {
  test('a role reads "Title at Company, City", and loses the comma with its city', () => {
    const role = { title: 'Engineer', company: 'Acme', location: 'Berlin' };

    expect(roleHeader(role, 'at')).toEqual([
      { field: 'title', text: 'Engineer' },
      ' at ',
      { field: 'company', text: 'Acme' },
      ', ',
      { field: 'location', text: 'Berlin' }
    ]);
    expect(text(roleHeader({ ...role, location: '' }, 'at'))).toBe('Engineer at Acme');
    expect(text(roleHeader({ ...role, location: undefined }, 'bei'))).toBe('Engineer bei Acme');
    expect(text(roleHeader({ ...role, location: '   ' }, 'at'))).toBe('Engineer at Acme');
  });

  test('a school reads "School (period)", and loses the brackets with its period', () => {
    expect(schoolLine({ school: 'Università di Pisa', period: '2014 – 2016' })).toEqual([
      { field: 'school', text: 'Università di Pisa' },
      ' ',
      { field: 'period', text: '(2014 – 2016)' }
    ]);
    expect(text(schoolLine({ school: 'Università di Pisa' }))).toBe('Università di Pisa');
  });

  // A degree's scope follows its name (#48): "Master's Programme … (60 ECTS)", and the school's line stays as it was.
  // The domain decides when a degree states it and writes the count; the words come from the caller's catalogue.
  const words = { credits: (count) => `${count} ECTS`, locale: 'en' };
  const pisa = {
    degree: "First Level Professional Master's Programme",
    school: 'Università di Pisa',
    period: '2014 – 2016',
    credits: 60
  };

  test('a degree with credits reads "Degree (60 ECTS)", and its school line does not change', () => {
    expect(degreeLine(pisa, words)).toEqual([
      { field: 'degree', text: "First Level Professional Master's Programme" },
      ' ',
      { field: 'credits', text: '(60 ECTS)' }
    ]);
    expect(schoolLine(pisa)).toEqual(schoolLine({ school: pisa.school, period: pisa.period }));
  });

  test('a degree states its credits only for a whole count above zero', () => {
    for (const unreadable of [undefined, null, 0, -60, 7.5, '60', 'sixty']) {
      expect(degreeLine({ ...pisa, credits: unreadable }, words)).toEqual([
        { field: 'degree', text: pisa.degree }
      ]);
      expect(scopeText({ ...pisa, credits: unreadable }, words)).toBe('');
    }
  });

  test('given no words for the credits, a degree writes none rather than a bare number', () => {
    expect(text(degreeLine(pisa))).toBe(pisa.degree);
    expect(scopeText(pisa)).toBe('');
    expect(text(degreeLine({ ...pisa, credits: 60 }, { credits: () => '  ' }))).toBe(pisa.degree);
  });

  test('the count is written as the CV’s language writes numbers', () => {
    expect(scopeText({ credits: 1500 }, { ...words, locale: 'de' })).toBe('1.500 ECTS');
    expect(scopeText({ credits: 1500 }, words)).toBe('1,500 ECTS');
  });

  test('a certification writes " – issuer" and " (year)" only for the parts it has', () => {
    expect(certificationLine({ issuer: 'Google', year: 2026 })).toEqual([' – Google', ' (2026)']);
    expect(certificationLine({ issuer: 'Google' })).toEqual([' – Google']);
    expect(certificationLine({ year: 2026 })).toEqual([' (2026)']);
    expect(certificationLine({ issuer: ' ', year: null })).toEqual([]);
  });

  test('a number is written as it is, and zero is not a missing year', () => {
    expect(certificationLine({ issuer: 'X', year: 0 })).toEqual([' – X', ' (0)']);
  });
});

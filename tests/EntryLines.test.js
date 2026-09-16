import { certificationLine, roleHeader, schoolLine } from '../domain/EntryLines.js';

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

  // A degree's scope follows its period (#48). The domain decides when the line carries it; the words come from the
  // caller, which has the catalogue and the CV's language.
  test('a school with credits reads "School (period) · scope", and only when the credits are a count', () => {
    const credits = (count) => `${count} ECTS`;
    const pisa = { school: 'Università di Pisa', period: '2014 – 2016', credits: 60 };

    expect(schoolLine(pisa, { credits })).toEqual([
      { field: 'school', text: 'Università di Pisa' },
      ' ',
      { field: 'period', text: '(2014 – 2016)' },
      ' · ',
      { field: 'credits', text: '60 ECTS' }
    ]);
    expect(text(schoolLine({ ...pisa, period: '' }, { credits }))).toBe(
      'Università di Pisa · 60 ECTS'
    );
    for (const unreadable of [undefined, null, 0, -60, 7.5, '60', 'sixty']) {
      expect(schoolLine({ ...pisa, credits: unreadable }, { credits })).toEqual(
        schoolLine({ school: pisa.school, period: pisa.period })
      );
    }
  });

  test('a school line given no words for the credits leaves them out rather than writing a bare number', () => {
    expect(text(schoolLine({ school: 'Università di Pisa', period: '2014', credits: 60 }))).toBe(
      'Università di Pisa (2014)'
    );
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

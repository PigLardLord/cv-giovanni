import { LetterExporter } from '../core/LetterExporter.js';

describe('LetterExporter', () => {
  const data = {
    name: 'Ada Lovelace',
    title: 'Engineer',
    email: 'ada@example.com',
    skills: [],
    relevant_experience: [],
    education: [],
    languages: [],
    certifications: []
  };

  // The letter copied the CV's literal name rather than diverge from it mid-sprint, and so named every
  // letter after this repository's owner as well (#34).
  test('names the letter after the candidate, beside the CV it goes with', () => {
    const exporter = new LetterExporter(null, { t: (key) => key });

    expect(exporter.filename(data, { profile: 'acme', locale: 'en', layout: 'spotlight' })).toBe(
      'ada-lovelace-acme-en-spotlight-cover.pdf'
    );
    expect(
      exporter.filename(data, {
        profile: 'acme',
        locale: 'en',
        layout: 'technical',
        pageSize: 'LETTER',
        colorMode: 'monochrome',
        variant: true
      })
    ).toBe('ada-lovelace-acme-en-technical-cover-letter-monochrome.pdf');
  });
});

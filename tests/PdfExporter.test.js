import { jest } from '@jest/globals';
import { PdfExporter } from '../core/PdfExporter.js';

describe('PdfExporter', () => {
  const data = {
    name: 'Giovanni Trovato', title: 'Engineer', location: 'Germany', email: 'a@b.c', phone: '123',
    profile: 'Profile', skills: [], relevant_experience: [], education: [], languages: [], certifications: []
  };

  test('builds a document with selectable text content', () => {
    const i18n = { t: (key) => key === 'cv:sections.experience' ? 'Professional Experience' : key };
    const document = new PdfExporter(null, i18n).buildDocument(data, 'technical');
    expect(document.pageSize).toEqual({ width: 595.28, height: 841.89 });
    expect(JSON.stringify(document.content)).toContain('Giovanni Trovato');
    expect(JSON.stringify(document.content)).toContain('Professional Experience');
  });

  test('builds a direct path for pre-generated downloads', () => {
    const exporter = new PdfExporter(null, { t: (key) => key });
    expect(exporter.filePath({ profile: 'general', locale: 'en', layout: 'technical' }))
      .toBe('generated/giovanni-trovato-general-en-technical.pdf');
  });

  test('supports injected document, page-format and theme boundaries', () => {
    const documentFactory = jest.fn(() => ({
      identity: { name: 'Injected', title: 'Role', subtitle: '', location: '', email: '', phone: '', availability: '', portfolio: '', social: [] },
      profile: 'Profile', careerHighlights: [], skills: [], experience: [], education: [], languages: [], certifications: []
    }));
    const pageFormats = { resolve: jest.fn(() => ({ width: 1, height: 2 })) };
    const themes = { resolve: jest.fn(() => ({ primary: '#000', accent: '#000', soft: '#fff', invertedHeader: false })) };
    const designSystem = { resolve: jest.fn(() => ({ defaultStyle: { font: 'Injected Font' }, styles: {} })) };
    const exporter = new PdfExporter(null, { t: (key) => key }, { documentFactory, pageFormats, themes, designSystem });

    const definition = exporter.buildDocument(data, { layout: 'classic', pageSize: 'LETTER', colorMode: 'monochrome' });

    expect(documentFactory).toHaveBeenCalledWith(data);
    expect(pageFormats.resolve).toHaveBeenCalledWith('LETTER');
    expect(themes.resolve).toHaveBeenCalledWith('classic', 'monochrome');
    expect(designSystem.resolve).toHaveBeenCalled();
    expect(definition.defaultStyle.font).toBe('Injected Font');
    expect(definition.pageSize).toEqual({ width: 1, height: 2 });
  });
});

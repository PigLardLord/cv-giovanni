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

describe('PdfExporter — what has to survive extraction and assistive reading', () => {
  const rich = {
    name: 'Giovanni Trovato', title: 'Senior iOS Engineer', location: 'Germany',
    email: 'a@b.c', phone: '123', availability: 'EU citizen',
    portfolio: 'https://portfolio.example',
    social: [{ platform: 'GitHub', url: 'https://github.com/example' }],
    profile: 'Profile', skills: [], relevant_experience: [],
    education: [{ degree: 'M.Sc.', school: 'Pisa', period: '2013 - 2015', description: 'Mobile' }],
    languages: [{ name: 'Italian', level: 'Native' }],
    certifications: [{ name: 'iOS Lead Essentials', issuer: 'Academy', year: 2024,
                       url: 'https://academy.example/achievement', description: 'Advanced' }]
  };
  const build = (layout) => new PdfExporter(null, { t: (key) => key }).buildDocument(rich, layout);
  const walk = function* (node) {
    if (Array.isArray(node)) { for (const child of node) yield* walk(child); return; }
    if (!node || typeof node !== 'object') return;
    yield node;
    for (const value of Object.values(node)) yield* walk(value);
  };
  const layouts = ['classic', 'spotlight', 'technical'];

  test.each(layouts)('%s puts no section heading inside a column row', (layout) => {
    // A parser walks the page: a section sharing a horizontal band with another emerges
    // interleaved, and the record boundaries a structured reader looks for are destroyed.
    const offenders = [...walk(build(layout).content)]
      .filter((node) => node.columns)
      .filter((node) => [...walk(node.columns)].some((child) => child.style === 'section'));
    expect(offenders).toEqual([]);
  });

  test.each(layouts)('%s sets no text below 9pt', (layout) => {
    const definition = build(layout);
    const sizes = [...walk(definition.content), definition.defaultStyle, ...Object.values(definition.styles)]
      .filter((node) => node && typeof node.fontSize === 'number')
      .map((node) => node.fontSize);
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((size) => size < 9)).toEqual([]);
  });

  test('renders every link as an annotation, not as raw URL text', () => {
    const nodes = [...walk(build('spotlight').content)];
    const linked = nodes.filter((node) => typeof node.link === 'string').map((node) => node.link);
    expect(linked).toEqual(expect.arrayContaining([
      'https://github.com/example', 'https://portfolio.example', 'https://academy.example/achievement'
    ]));
    const visible = nodes.filter((node) => typeof node.text === 'string').map((node) => node.text);
    expect(visible.filter((text) => text.includes('https://'))).toEqual([]);
  });

  test('names the delivered file after the person and the role, not the build system', () => {
    // The recruiter's inbox receives this name. 'general', 'en' and 'spotlight' are build words,
    // and the role is the one thing that helps them find the file again.
    const exporter = new PdfExporter(null, { t: (key) => key });
    expect(exporter.downloadName(rich)).toBe('Giovanni-Trovato-Senior-iOS-Engineer-CV.pdf');
    expect(exporter.downloadName({})).toBe('CV.pdf');
  });

  test('omits an education description rather than rendering an empty line', () => {
    const bare = { ...rich, education: [{ degree: 'M.Sc.', school: 'Pisa', period: '2013 - 2015' }] };
    const definition = new PdfExporter(null, { t: (key) => key }).buildDocument(bare, 'classic');
    // Only nodes that actually carry a `text` key: a stack or a table legitimately has none.
    const carriers = [...walk(definition.content)].filter((node) => 'text' in node);
    expect(carriers.length).toBeGreaterThan(0);
    expect(carriers.filter((node) => node.text === undefined || node.text === '')).toEqual([]);
  });

  test('leaves a measure narrow enough to read', () => {
    // A4 is 595.28pt wide. Convention and readability work put the comfortable band at
    // 50-75 characters; WCAG 1.4.8 sets 80 as the accessibility ceiling.
    const [left, , right] = build('spotlight').pageMargins;
    expect(left + right).toBeGreaterThanOrEqual(128);
  });
});

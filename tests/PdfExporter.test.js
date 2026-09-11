import { jest } from '@jest/globals';
import { PdfExporter } from '../core/PdfExporter.js';

describe('PdfExporter', () => {
  const data = {
    name: 'Giovanni Trovato',
    title: 'Engineer',
    location: 'Germany',
    email: 'a@b.c',
    phone: '123',
    profile: 'Profile',
    skills: [],
    relevant_experience: [],
    education: [],
    languages: [],
    certifications: []
  };

  test('builds a document with selectable text content', () => {
    const i18n = {
      t: (key) => (key === 'cv:sections.experience' ? 'Professional Experience' : key)
    };
    const document = new PdfExporter(null, i18n).buildDocument(data, 'technical');
    expect(document.pageSize).toEqual({ width: 595.28, height: 841.89 });
    expect(JSON.stringify(document.content)).toContain('Giovanni Trovato');
    expect(JSON.stringify(document.content)).toContain('Professional Experience');
  });

  test('builds a direct path for pre-generated downloads', () => {
    const exporter = new PdfExporter(null, { t: (key) => key });
    expect(exporter.filePath({ profile: 'general', locale: 'en', layout: 'technical' })).toBe(
      'generated/giovanni-trovato-general-en-technical.pdf'
    );
  });

  test('supports injected document, page-format and theme boundaries', () => {
    const documentFactory = jest.fn(() => ({
      identity: {
        name: 'Injected',
        title: 'Role',
        subtitle: '',
        location: '',
        email: '',
        phone: '',
        availability: '',
        portfolio: '',
        social: []
      },
      profile: 'Profile',
      careerHighlights: [],
      skills: [],
      experience: [],
      education: [],
      languages: [],
      certifications: []
    }));
    const pageFormats = { resolve: jest.fn(() => ({ width: 1, height: 2 })) };
    const themes = {
      resolve: jest.fn(() => ({
        primary: '#000',
        accent: '#000',
        soft: '#fff',
        invertedHeader: false
      }))
    };
    const designSystem = {
      resolve: jest.fn(() => ({ defaultStyle: { font: 'Injected Font' }, styles: {} }))
    };
    const exporter = new PdfExporter(
      null,
      { t: (key) => key },
      { documentFactory, pageFormats, themes, designSystem }
    );

    const definition = exporter.buildDocument(data, {
      layout: 'nerd',
      pageSize: 'LETTER',
      colorMode: 'monochrome'
    });

    expect(documentFactory).toHaveBeenCalledWith(data);
    expect(pageFormats.resolve).toHaveBeenCalledWith('LETTER');
    expect(themes.resolve).toHaveBeenCalledWith('nerd', 'monochrome');
    expect(designSystem.resolve).toHaveBeenCalled();
    expect(definition.defaultStyle.font).toBe('Injected Font');
    expect(definition.pageSize).toEqual({ width: 1, height: 2 });
  });
});

describe('PdfExporter — what has to survive extraction and assistive reading', () => {
  const rich = {
    name: 'Giovanni Trovato',
    title: 'Senior iOS Engineer',
    location: 'Germany',
    email: 'a@b.c',
    phone: '123',
    availability: 'EU citizen',
    portfolio: 'https://portfolio.example',
    social: [{ platform: 'GitHub', url: 'https://github.com/example' }],
    profile: 'Profile',
    skills: [],
    relevant_experience: [],
    career_highlights: [
      '6 years owning an enterprise iOS MDM client from its first commit',
      '~4,800 Android tests, 82% UI coverage, 75% faster CI feedback',
      'MDM clients in production across tens of thousands of managed devices'
    ],
    education: [{ degree: 'M.Sc.', school: 'Pisa', period: '2013 - 2015', description: 'Mobile' }],
    languages: [{ name: 'Italian', level: 'Native' }],
    certifications: [
      {
        name: 'iOS Lead Essentials',
        issuer: 'Academy',
        year: 2024,
        url: 'https://academy.example/achievement',
        description: 'Advanced'
      }
    ]
  };
  const build = (layout) => new PdfExporter(null, { t: (key) => key }).buildDocument(rich, layout);
  const walk = function* (node) {
    if (Array.isArray(node)) {
      for (const child of node) yield* walk(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    yield node;
    for (const value of Object.values(node)) yield* walk(value);
  };
  const layouts = ['nerd', 'spotlight', 'technical'];

  test.each(layouts)('%s keeps every rail label a single short line', (layout) => {
    // A section label may share a band with its block — that is the rail, and it is the shape
    // the parser handles. What it may never be is long enough to wrap: a wrapped label
    // interleaves word by word with the body and destroys the very text the audit matches on.
    const labels = [...walk(build(layout).content)]
      .filter((node) => Array.isArray(node.columns))
      .flatMap((node) => node.columns.filter((entry) => entry.style === 'section'));
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => {
      expect(typeof label.text).toBe('string');
      expect(label.text.length).toBeLessThanOrEqual(30);
      expect(label.width).toBeGreaterThanOrEqual(110);
    });
  });

  test.each(layouts)('%s sets no text below 9pt', (layout) => {
    const definition = build(layout);
    const sizes = [
      ...walk(definition.content),
      definition.defaultStyle,
      ...Object.values(definition.styles)
    ]
      .filter((node) => node && typeof node.fontSize === 'number')
      .map((node) => node.fontSize);
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((size) => size < 9)).toEqual([]);
  });

  test('renders every link as an annotation, not as raw URL text', () => {
    const nodes = [...walk(build('spotlight').content)];
    const linked = nodes.filter((node) => typeof node.link === 'string').map((node) => node.link);
    expect(linked).toEqual(
      expect.arrayContaining([
        'https://github.com/example',
        'https://portfolio.example',
        'https://academy.example/achievement'
      ])
    );
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
    const bare = {
      ...rich,
      education: [{ degree: 'M.Sc.', school: 'Pisa', period: '2013 - 2015' }]
    };
    const definition = new PdfExporter(null, { t: (key) => key }).buildDocument(bare, 'nerd');
    // Only nodes that actually carry a `text` key: a stack or a table legitimately has none.
    const carriers = [...walk(definition.content)].filter((node) => 'text' in node);
    expect(carriers.length).toBeGreaterThan(0);
    expect(carriers.filter((node) => node.text === undefined || node.text === '')).toEqual([]);
  });

  // The web page already skips a missing description. The PDF reserved a paragraph for it anyway,
  // and on spotlight LETTER one reserved line is the difference between two pages and three.
  test('omits a certification description rather than rendering an empty line', () => {
    const bare = {
      ...rich,
      certifications: [{ name: 'iOS Lead Essentials', issuer: 'Academy', year: 2024 }]
    };
    const definition = new PdfExporter(null, { t: (key) => key }).buildDocument(bare, 'nerd');
    const carriers = [...walk(definition.content)].filter((node) => 'text' in node);
    expect(carriers.length).toBeGreaterThan(0);
    expect(carriers.filter((node) => node.text === undefined || node.text === '')).toEqual([]);
  });

  test.each(layouts)('%s never puts two wrapping blocks in one column row', (layout) => {
    // Interleaving needs two columns that BOTH wrap: a parser walks the band and alternates
    // their lines. One long entry beside a short label is safe, which is why the skills rows
    // survive and the impact cards did not.
    const wraps = (node) => typeof node.text === 'string' && node.text.length > 40;
    const offenders = [...walk(build(layout).content)]
      .filter((node) => Array.isArray(node.columns))
      .filter((node) => node.columns.filter((entry) => wraps(entry)).length > 1);
    expect(offenders).toEqual([]);
  });

  test('does not claim a structure tree it cannot populate', () => {
    // pdfmake 0.2.20 writes the tagged FLAG but never builds the tree: `Tagged: yes` over an
    // empty /StructTreeRoot tells assistive software that structure exists when none does,
    // which is worse than an honest `Tagged: no`. Setting it again is only correct alongside
    // a renderer that emits marked content — see the capability gap recorded in AGENTS.md.
    expect(build('spotlight').tagged).toBeUndefined();
  });

  test('keeps every technology name unbreakable, so none loses its hyphen', () => {
    const named = {
      ...rich,
      skills: [
        {
          category: 'iOS',
          items: [
            { name: 'Objective-C' },
            { name: 'Dependency-Track' },
            { name: 'AI-assisted engineering' }
          ]
        }
      ]
    };
    const definition = new PdfExporter(null, { t: (key) => key }).buildDocument(named, 'nerd');
    const names = [...walk(definition.content)].filter((node) => node.noWrap);
    expect(names.map((node) => node.text)).toEqual(
      expect.arrayContaining(['Objective-C', 'Dependency-Track', 'AI-assisted engineering'])
    );
  });

  test('protects hyphenated compounds inside body copy, not only in the skills list', () => {
    const withBullet = {
      ...rich,
      relevant_experience: [
        {
          title: 'Engineer',
          company: 'C',
          location: 'L',
          period: '2018 - 2026',
          highlights: ['Resolved defects across iOS (Swift, Objective-C) and Android.']
        }
      ]
    };
    const definition = new PdfExporter(null, { t: (key) => key }).buildDocument(withBullet, 'nerd');
    const protectedRuns = [...walk(definition.content)]
      .filter((node) => node.noWrap)
      .map((node) => node.text);
    expect(protectedRuns).toContain('Objective-C)');
  });

  test('offers a download only for a combination that was actually generated', () => {
    // The link used to be built from the naming rule alone, so it pointed at a file whenever
    // the rule could name one. Today the German profile fails earlier and hides the bug; the
    // day profiles/general/de.json lands, the page renders and the button 404s in silence.
    const exporter = new PdfExporter(null, { t: (key) => key });
    const generated = [
      'giovanni-trovato-general-en-spotlight.pdf',
      'giovanni-trovato-general-en-nerd.pdf'
    ];
    expect(
      exporter.isAvailable(generated, { profile: 'general', locale: 'en', layout: 'spotlight' })
    ).toBe(true);
    expect(
      exporter.isAvailable(generated, { profile: 'general', locale: 'de', layout: 'spotlight' })
    ).toBe(false);
    expect(
      exporter.isAvailable(generated, { profile: 'general', locale: 'en', layout: 'technical' })
    ).toBe(false);
  });

  test('treats a missing or unreadable manifest as nothing being available', () => {
    // A manifest that failed to load must not read as "everything is there": the page would
    // offer every download and 404 on all of them.
    const exporter = new PdfExporter(null, { t: (key) => key });
    expect(exporter.isAvailable(undefined, { locale: 'en', layout: 'spotlight' })).toBe(false);
    expect(exporter.isAvailable([], { locale: 'en', layout: 'spotlight' })).toBe(false);
    expect(exporter.isAvailable('not a list', { locale: 'en', layout: 'spotlight' })).toBe(false);
  });

  test('leaves a measure narrow enough to read', () => {
    // The measure is now the body column, not the page minus its margins: convention and
    // readability work put the comfortable band at 50-75 characters and WCAG 1.4.8 sets 80 as
    // the ceiling, which at 9.5pt Roboto means staying under roughly 380pt.
    const bodyColumns = [...walk(build('spotlight').content)]
      .filter((node) => Array.isArray(node.columns))
      .flatMap((node) => node.columns.filter((entry) => Array.isArray(entry.stack)));
    expect(bodyColumns.length).toBeGreaterThan(0);
    bodyColumns.forEach((column) => expect(column.width).toBeLessThanOrEqual(380));
  });
});

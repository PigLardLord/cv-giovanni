import { CvDocument } from '../domain/CvDocument.js';
import { PageFormat } from '../domain/PageFormat.js';
import { LayoutThemeRegistry } from '../adapters/LayoutThemeRegistry.js';
import { PdfDesignSystem } from '../adapters/PdfDesignSystem.js';

export class PdfExporter {
  constructor(_renderer = null, i18n = null, dependencies = {}) {
    this.i18n = i18n;
    this.documentFactory = dependencies.documentFactory || ((data) => new CvDocument(data));
    this.pageFormats = dependencies.pageFormats || new PageFormat();
    this.themes = dependencies.themes || new LayoutThemeRegistry();
    this.designSystem = dependencies.designSystem || new PdfDesignSystem();
  }

  filename({ profile = 'general', locale = 'en', layout = 'spotlight', pageSize = 'A4', colorMode = 'color', variant = false } = {}) {
    const suffix = variant ? `-${pageSize.toLowerCase()}-${colorMode}` : '';
    return `giovanni-trovato-${profile}-${locale}-${layout}${suffix}.pdf`;
  }

  /** The name the recruiter's inbox receives: the person and the role, no build vocabulary. */
  downloadName({ name = '', title = '' } = {}) {
    const words = `${name} ${title} CV`.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/);
    return `${words.join('-')}.pdf`;
  }

  filePath(options = {}) {
    return `generated/${this.filename(options)}`;
  }

  buildDocument(data, options = {}) {
    if (typeof options === 'string') options = { layout: options };
    const { layout = 'spotlight', pageSize = 'A4', colorMode = 'color' } = options;
    const model = this.documentFactory(data);
    const format = this.pageFormats.resolve(pageSize);
    const theme = this.themes.resolve(layout, colorMode);
    const t = (key) => this.i18n?.t(key) || key;
    // The rail: a single-line label beside a wrapping block. That shape is the one the parser
    // handles — the label glues to the block's first line and nothing interleaves — so the
    // section headings can leave the vertical flow without lying to an extractor.
    const RAIL = 116, GUTTER = 14, BODY = 373;
    const railed = (key, blocks, gap = 6) => ({
      columns: [
        { width: RAIL, text: t(key), style: 'section', alignment: 'right' },
        { width: BODY, stack: blocks }
      ],
      columnGap: GUTTER,
      margin: [0, gap, 0, 0]
    });
    const indented = (node) => ({ ...node, margin: [RAIL + GUTTER, ...(node.margin || [0, 0, 0, 0]).slice(1)] });
    const skillRows = model.skills.map((group) => ({
      columns: [
        { text: group.category, bold: true, color: theme.ink, width: 96 },
        { text: this.unbreakableList(group.items.map((item) => item.name)), width: 257 }
      ],
      columnGap: 10,
      margin: [0, 0, 0, 6]
    }));
    // The rule is "a role is never split from its first achievement, and no page opens
    // mid-sentence" — not "a role is atomic". Atomic meant a twenty-line entry jumped the page
    // whole and left a third of the previous one blank. The head travels with its first
    // achievement; the rest may flow, and each achievement is a complete sentence.
    const jobs = model.experience.map((job) => ({
      stack: [
        { unbreakable: true, stack: [
          { text: job.title, style: 'itemTitle' },
          { text: `${job.company} · ${job.location}`, style: 'employer' },
          { text: job.period, style: 'meta' },
          job.summary ? { text: this.unbreakableText(job.summary), margin: [0, 3, 0, 3] } : null,
          ...(job.highlights?.length
            ? [{ ul: [{ text: this.unbreakableText(job.highlights[0]) }], margin: [12, 3, 0, 0] }]
            : [])
        ].filter(Boolean) },
        ...(job.highlights?.length > 1
          ? [{ ul: job.highlights.slice(1).map((line) => (
               { text: this.unbreakableText(line), unbreakable: true })),
               margin: [12, 0, 0, 0] }]
          : [])
      ],
      margin: [0, 0, 0, 12]
    }));
    const education = model.education.map((item) => ({ stack: [
      { text: item.degree, bold: true, color: theme.ink },
      { text: `${item.school} · ${item.period}`, style: 'meta', margin: [0, 0, 0, 12] },
      ...(item.description ? [{ text: item.description, style: 'meta', margin: [0, 3, 0, 12] }] : [])
    ] }));
    const languages = model.languages.map((item) => ({
      text: [{ text: `${item.name}: `, bold: true }, item.level], margin: [0, 0, 0, 6]
    }));
    const certifications = model.certifications.map((item) => ({ stack: [
      { text: `${item.name} — ${item.issuer} (${item.year})`, bold: true, color: theme.ink,
        ...(item.url ? { link: item.url } : {}) },
      { text: item.description, margin: [0, 3, 0, 6] }
    ] }));
    const links = model.identity.social.map((item) => ({ label: item.platform, url: item.url }));
    if (model.identity.portfolio && !links.some((link) => link.url === model.identity.portfolio)) {
      links.push({ label: t('cv:contacts.portfolio'), url: model.identity.portfolio });
    }
    const header = this.createHeader(model, theme, links);
    const profile = indented({ text: model.profile, margin: [0, 12, 0, 0] });
    const skills = [railed('cv:sections.skills', skillRows)];
    const experience = [railed('cv:sections.experience', jobs)];
    const supporting = [
      railed('cv:sections.education', education),
      railed('cv:sections.languages', languages),
      railed('cv:sections.certifications', certifications)
    ];
    // Each highlight is one text node with a vector tick beside it: the tick carries no text,
    // so nothing shares a band with anything that wraps.
    const impact = model.careerHighlights.length ? [railed('cv:sections.selectedImpact',
      model.careerHighlights.map((text) => ({
        columns: [
          { width: 2, canvas: [{ type: 'rect', x: 0, y: 2, w: 2, h: 9, color: theme.signalBright }] },
          { width: 347, text, bold: true, color: theme.ink }
        ],
        columnGap: 8,
        margin: [0, 0, 0, 6]
      })))] : [];
    const layouts = {
      classic: [header, profile, ...experience, ...skills, ...supporting],
      spotlight: [header, profile, ...impact, ...experience, ...skills, ...supporting],
      technical: [header, profile, ...skills, ...experience, ...supporting]
    };

    const typography = this.designSystem.resolve(theme);
    return {
      pageSize: { width: format.width, height: format.height },
      // 503pt of content (rail + gutter + body) on every paper size, so line breaks and
      // pagination stay comparable; the extra width of LETTER goes into the margin, and 40pt
      // top and bottom clears the 12mm a printer can clip.
      pageMargins: [(format.width - 503) / 2, 40, (format.width - 503) / 2, 40],
      info: { title: `${model.identity.name} — ${model.identity.title}`, author: model.identity.name },
      ...typography,
      content: layouts[layout] || layouts.spotlight
    };
  }

  createHeader(model, theme, links) {
    // No banner. The inverted header forced every foreground colour to white, which is why the
    // accent rendered on zero glyphs in all three layouts: the palette was there and nothing
    // could show it. An open masthead lets scale carry the identity and colour carry structure.
    return { stack: [
      { text: model.identity.name, style: 'name' },
      { text: model.identity.title, style: 'role', margin: [0, 3, 0, 0] },
      ...(model.identity.subtitle ? [{ text: model.identity.subtitle, style: 'meta', margin: [0, 3, 0, 0] }] : []),
      { text: `${model.identity.location} · ${model.identity.email} · ${model.identity.phone}`,
        style: 'meta', margin: [0, 6, 0, 0] },
      { text: this.linkLine(links, theme), fontSize: 9, margin: [0, 3, 0, 0] },
      ...(model.identity.availability
        ? [{ text: model.identity.availability, style: 'meta', margin: [0, 3, 0, 0] }] : []),
      // The bar sits over the rail and the hairline runs the body: one vector gesture that
      // announces the axis the whole document is built on. Vector, so no raster image ships.
      { canvas: [
        { type: 'rect', x: 0, y: 0, w: 126, h: 3, color: theme.signalBright },
        { type: 'rect', x: 126, y: 1.25, w: 377, h: 0.5, color: theme.ink }
      ], margin: [0, 12, 0, 0] }
    ] };
  }

  /**
   * Body copy with every hyphenated compound held together.
   *
   * pdfmake breaks a line at an existing hyphen, and plain text extraction then rejoins the two
   * halves without it — `Objective-C` arrives as `ObjectiveC`, which no search for the canonical
   * spelling will find. Only the compounds become their own nodes; the prose between them stays
   * one run, so the document does not turn into a node per word.
   * @param {string} text - Copy as the data wrote it
   * @returns {string|Array} The copy, unchanged when it holds no compound
   */
  unbreakableText(text) {
    if (typeof text !== 'string') return text;
    const parts = text.split(/(\S+-\S+)/g).filter((part) => part !== '');
    if (!parts.some((part) => /\S+-\S+/.test(part))) return text;
    return parts.map((part) => /\S+-\S+/.test(part) ? { text: part, noWrap: true } : { text: part });
  }

  /** Names that must never break: a wrap on the hyphen extracts `Objective-C` as `ObjectiveC`. */
  unbreakableList(names, separator = ', ') {
    return names.flatMap((name, index) => [
      ...(index ? [{ text: separator }] : []),
      { text: name, noWrap: true }
    ]);
  }

  /** The links as annotations. A printed URL is unusable; an unlinked one is worse than absent. */
  linkLine(links, theme) {
    return links.flatMap((link, index) => [
      ...(index ? [{ text: ' · ', color: theme.muted }] : []),
      { text: link.label, link: link.url, decoration: 'underline', color: theme.signal }
    ]);
  }
}

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
    const section = (key) => ({ text: t(key), style: 'section' });
    const skillRows = model.skills.map((group) => ({
      columns: [
        { text: group.category, bold: true, color: theme.primary, width: 105 },
        { text: group.items.map((item) => item.name).join(', '), width: '*' }
      ],
      columnGap: 8,
      margin: [0, 0, 0, 5]
    }));
    const jobs = model.experience.map((job) => ({
      unbreakable: true,
      stack: [
        { text: job.title, style: 'itemTitle' },
        { text: `${job.company} · ${job.location}`, bold: true },
        { text: job.period, style: 'meta' },
        job.summary ? { text: job.summary, margin: [0, 3, 0, 3] } : null,
        ...(job.highlights?.length ? [{ ul: job.highlights, margin: [12, 2, 0, 0] }] : [])
      ].filter(Boolean),
      margin: [0, 0, 0, 9]
    }));
    const education = model.education.map((item) => ({ stack: [
      { text: item.degree, bold: true, color: theme.primary },
      { text: `${item.school} · ${item.period}`, margin: [0, 0, 0, 7] },
      ...(item.description ? [{ text: item.description, style: 'meta', margin: [0, 2, 0, 7] }] : [])
    ] }));
    const languages = model.languages.map((item) => ({
      text: [{ text: `${item.name}: `, bold: true }, item.level], margin: [0, 0, 0, 4]
    }));
    const certifications = model.certifications.map((item) => ({ stack: [
      { text: `${item.name} — ${item.issuer} (${item.year})`, bold: true, color: theme.primary,
        ...(item.url ? { link: item.url } : {}) },
      { text: item.description, margin: [0, 2, 0, 6] }
    ] }));
    const links = model.identity.social.map((item) => ({ label: item.platform, url: item.url }));
    if (model.identity.portfolio && !links.some((link) => link.url === model.identity.portfolio)) {
      links.push({ label: t('cv:contacts.portfolio'), url: model.identity.portfolio });
    }
    const header = this.createHeader(model, theme, links);
    const profile = { text: model.profile, margin: [0, 8, 0, 3] };
    const skills = [{
      unbreakable: true,
      stack: [section('cv:sections.skills'), { stack: skillRows, fillColor: theme.soft, margin: [8, 6, 8, 4] }]
    }];
    const experience = [section('cv:sections.experience'), ...jobs];
    // Stacked, never columned: a parser walks the page, so two sections sharing a horizontal
    // band emerge interleaved and the record boundaries a structured reader looks for are lost.
    const supporting = [
      section('cv:sections.education'), ...education,
      section('cv:sections.languages'), ...languages,
      section('cv:sections.certifications'), ...certifications
    ];
    const impact = model.careerHighlights.length ? [
      section('cv:sections.selectedImpact'),
      { columns: model.careerHighlights.map((text) => ({ text, bold: true, fillColor: theme.soft, margin: [7, 7, 7, 7] })), columnGap: 7 }
    ] : [];
    const layouts = {
      classic: [header, profile, ...experience, ...skills, ...supporting],
      spotlight: [header, profile, ...impact, ...experience, ...skills, ...supporting],
      technical: [header, profile, ...skills, ...experience, ...supporting]
    };

    const typography = this.designSystem.resolve(theme);
    return {
      pageSize: { width: format.width, height: format.height },
      pageMargins: [64, 28, 64, 28],
      info: { title: `${model.identity.name} — ${model.identity.title}`, author: model.identity.name },
      ...typography,
      content: layouts[layout] || layouts.spotlight
    };
  }

  createHeader(model, theme, links) {
    const inverted = theme.invertedHeader;
    return { table: { widths: ['*'], body: [[{
      fillColor: inverted ? theme.primary : '#FFFFFF',
      color: inverted ? '#FFFFFF' : theme.primary,
      margin: [14, 10, 14, 10],
      stack: [
        { text: model.identity.name, style: 'name', color: inverted ? '#FFFFFF' : theme.primary },
        { text: model.identity.title, style: 'role', color: inverted ? '#FFFFFF' : theme.accent },
        ...(model.identity.subtitle ? [{ text: model.identity.subtitle, margin: [0, 3, 0, 0] }] : []),
        { text: `${model.identity.location} · ${model.identity.email} · ${model.identity.phone}`, fontSize: 9, margin: [0, 4, 0, 0] },
        { text: this.linkLine(links, inverted, theme), fontSize: 9, margin: [0, 2, 0, 0] },
        ...(model.identity.availability ? [{ text: model.identity.availability, fontSize: 9, margin: [0, 2, 0, 0] }] : [])
      ]
    }]] }, layout: 'noBorders' };
  }

  /** The links as annotations. A printed URL is unusable; an unlinked one is worse than absent. */
  linkLine(links, inverted, theme) {
    return links.flatMap((link, index) => [
      ...(index ? [{ text: ' · ' }] : []),
      { text: link.label, link: link.url, decoration: 'underline',
        color: inverted ? '#FFFFFF' : theme.accent }
    ]);
  }
}

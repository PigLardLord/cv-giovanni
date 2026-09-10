/**
 * How the CV looks on a page.
 *
 * This is an adapter: it speaks pdfmake's dialect — points, columns, canvas rectangles, style
 * names — and nothing above it should have to. It was extracted from `core/PdfExporter.js`,
 * where a change of typeface and a change of orchestration landed in the same file and neither
 * could be reviewed on its own. `tests/CoreHasNoUI.test.js` fails if any of it goes back.
 *
 * It knows the document model and the resolved theme, format and type scale. It knows nothing
 * about profiles, locales, filenames or where the bytes end up.
 */
import { readableAddress } from '../domain/ReadableUrl.js';

export class PdfLayout {
  /**
   * @param {object} model - the CV document model
   * @param {object} context - `layout` name, resolved `format`, `theme` and `typography`, and
   *   `t`, the translator, already bound by the caller
   * @returns {object} a pdfmake document definition
   */
  compose(model, { layout = 'spotlight', format, theme, typography, t = (key) => key } = {}) {
    // The rail: a single-line label beside a wrapping block. That shape is the one the parser
    // handles — the label glues to the block's first line and nothing interleaves — so the
    // section headings can leave the vertical flow without lying to an extractor.
    // Side margins are fixed; the body takes whatever the paper gives. LETTER is wider than A4,
    // so it gets a slightly longer line instead of a wider margin — the alternative was throwing
    // its extra width away and paying for it with a third page.
    const RAIL = 116, GUTTER = 10, SIDE = 46;
    const BODY = format.width - 2 * SIDE - RAIL - GUTTER;
    const railed = (key, blocks, gap = 6) => ({
      columns: [
        { width: RAIL, text: t(key), style: 'section', alignment: 'right' },
        { width: BODY, stack: blocks }
      ],
      columnGap: GUTTER,
      margin: [0, gap, 0, 0]
    });
    const indented = (node) => ({ ...node, margin: [RAIL + GUTTER, ...(node.margin || [0, 0, 0, 0]).slice(1)] });
    const CATEGORY = 132;
    const skillRows = model.skills.map((group) => ({
      columns: [
        { text: group.category, bold: true, color: theme.ink, width: CATEGORY },
        { text: this.unbreakableList(group.items.map((item) => item.name)), width: BODY - CATEGORY - 10 }
      ],
      columnGap: 10,
      margin: [0, 0, 0, 3]
    }));
    // What must never split is the role's identity: title, employer, dates and the summary
    // travel together, so a reader turning the page never meets a bare heading. The
    // achievements below may flow, and each is individually unbreakable so no page opens
    // mid-sentence. Holding the first achievement in the head too was tried: it made the head
    // tall enough to jump the page whole, wasting more space than the guarantee was worth.
    const jobs = model.experience.map((job) => ({
      stack: [
        { unbreakable: true, stack: [
          { text: job.title, style: 'itemTitle' },
          { text: `${job.company} · ${job.location}`, style: 'employer' },
          { text: job.period, style: 'meta' },
          job.summary ? { text: this.unbreakableText(job.summary), margin: [0, 3, 0, 3] } : null
        ].filter(Boolean) },
        ...(job.highlights?.length
          ? [{
            ul: job.highlights.map((line) => ({
              text: this.unbreakableText(line), unbreakable: true
            })),
            margin: [12, 0, 0, 0]
          }]
          : [])
      ],
      margin: [0, 0, 0, 6]
    }));
    const education = model.education.map((item) => ({ stack: [
      { text: item.degree, bold: true, color: theme.ink },
      { text: `${item.school} · ${item.period}`, style: 'meta', margin: [0, 0, 0, 6] },
      ...(item.description ? [{ text: item.description, style: 'meta', margin: [0, 3, 0, 12] }] : [])
    ] }));
    const languages = model.languages.map((item) => ({
      text: [{ text: `${item.name}: `, bold: true }, item.level], margin: [0, 0, 0, 6]
    }));
    // Without a description, the spacing moves onto the name line instead of an empty paragraph.
    const certifications = model.certifications.map((item) => ({ stack: [
      { text: `${item.name} — ${item.issuer} (${item.year})`, bold: true, color: theme.ink,
        ...(item.url ? { link: item.url } : {}),
        ...(item.description ? {} : { margin: [0, 0, 0, 6] }) },
      ...(item.description ? [{ text: item.description, margin: [0, 3, 0, 6] }] : [])
    ] }));
    // The address, not the platform name. A PDF link annotation carries the URL but the text
    // layer carries only what was drawn, so "GitHub" over a hyperlink extracts as "GitHub" and
    // the parsed record has no address at all — five links, none of them recoverable. Printed,
    // it is worse: nobody can type a word.
    const links = model.identity.social.map((item) => ({
      label: readableAddress(item.url, item.platform), url: item.url
    }));
    if (model.identity.portfolio && !links.some((link) => link.url === model.identity.portfolio)) {
      links.push({
        label: readableAddress(model.identity.portfolio, t('cv:contacts.portfolio')),
        url: model.identity.portfolio
      });
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
        margin: [0, 0, 0, 3]
      })))] : [];
    const layouts = {
      nerd: [header, profile, ...experience, ...skills, ...supporting],
      spotlight: [header, profile, ...impact, ...experience, ...skills, ...supporting],
      technical: [header, profile, ...skills, ...experience, ...supporting]
    };

    return {
      pageSize: { width: format.width, height: format.height },
      // 503pt of content (rail + gutter + body) on every paper size, so line breaks and
      // pagination stay comparable; the extra width of LETTER goes into the margin, and 40pt
      // top and bottom clears the 12mm a printer can clip.
      pageMargins: [SIDE, 40, SIDE, 40],
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
      // An address broken across two lines is a wrong address: the reader retypes half of it,
      // and extraction welds the halves — `sites.google.com/view/` + `giovanni-trovato` came
      // back as one token with the hyphen gone, which the compound check caught. The line may
      // break between addresses; never inside one.
      { text: link.label, link: link.url, decoration: 'underline', color: theme.signal, noWrap: true }
    ]);
  }
}

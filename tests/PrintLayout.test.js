import { JSDOM } from 'jsdom';
import { readProjectFile, ruleBody, declaration, lengthValue } from './helpers/cssRules.js';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe('print layout contract', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('print.css');
  const document = new JSDOM(html).window.document;

  const size = (selector, property) => lengthValue(declaration(css, selector, property));

  /*
   * Round 4: the two-column grid is gone. A single full-width column is what
   * removes the ATS interleaving risk at the root — text extraction order is
   * now just DOM order, because there is no second column to interleave with.
   */
  describe('markup structure', () => {
    const SECTION_ORDER = [
      'profile',
      'skills',
      'experience',
      'education',
      'languages',
      'certifications',
      'interests'
    ];

    const bodySections = () => [...document.querySelectorAll('.main-content section')];

    test('carries no column wrappers at all', () => {
      ['.content-grid', '.primary-column', '.secondary-column'].forEach((selector) => {
        expect(document.querySelectorAll(selector)).toHaveLength(0);
      });
    });

    test('stacks every body section in the single reading order', () => {
      expect(bodySections().map((section) => section.querySelector('[id]').id))
        .toEqual(SECTION_ORDER);
    });

    test('hangs every body section directly off the main column', () => {
      bodySections().forEach((section) => {
        expect(section.parentElement.classList.contains('main-content')).toBe(true);
      });
    });

    test('declares each section container exactly once', () => {
      SECTION_ORDER.forEach((id) => {
        expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
      });
    });

    /*
     * The header reads top to bottom too: who, what, how to reach him, and
     * only then the availability qualifier.
     */
    test('orders the identity block name, title, subtitle, contact, availability', () => {
      const order = [...document.querySelectorAll('.hero-text > *')]
        .map((element) => element.id || element.className);

      expect(order).toEqual([
        'name',
        'title',
        'subtitle',
        'contacts',
        'contact-line social-links',
        'availability'
      ]);
    });

    /*
     * The contact block is a container the renderer fills with one element per
     * row, so the template no longer holds a location span that an inline run
     * would have to wrap around.
     */
    test('leaves the contact block empty for the renderer to fill with rows', () => {
      const block = document.getElementById('contacts');

      expect(block.tagName).toBe('DIV');
      expect(block.children).toHaveLength(0);
      expect(document.querySelectorAll('#location')).toHaveLength(0);
    });

    test('drops the contact card and the decorative title accents', () => {
      expect(document.querySelectorAll('.contact-card')).toHaveLength(0);
      expect(document.querySelectorAll('.title-accent')).toHaveLength(0);
    });

    test('uses no emoji anywhere in the template', () => {
      expect(html).not.toMatch(EMOJI);
    });

    test('provides a container for the print footers', () => {
      expect(document.querySelectorAll('.page-footers')).toHaveLength(1);
    });
  });

  describe('pagination safety', () => {
    test.each([
      ['.job-highlights li'],
      ['.edu-entry'],
      ['.certifications-list li'],
      ['.skill-group']
    ])('%s never splits across a page break', (selector) => {
      expect(declaration(css, selector, 'break-inside')).toBe('avoid');
      expect(declaration(css, selector, 'page-break-inside')).toBe('avoid');
    });

    test('the experience section itself stays breakable so it can span both pages', () => {
      expect(declaration(css, '.experience-section', 'break-inside')).toBe('auto');
      expect(declaration(css, '.experience-section', 'page-break-inside')).toBe('auto');
    });

    /*
     * Regression: a job entry that is taller than the space left on the page is
     * an unbreakable monolith, and Chromium can only move it whole to the next
     * page — stranding half a page of white behind it. Entries must break; only
     * their heading group and their individual bullets stay whole.
     */
    test.each([
      ['.job-entry'],
      ['.job-highlights'],
      ['.main-content']
    ])('%s stays breakable so the column can start on page one', (selector) => {
      expect(declaration(css, selector, 'break-inside')).toBe('auto');
      expect(declaration(css, selector, 'page-break-inside')).toBe('auto');
    });

    /*
     * A section may only be unbreakable while it is far shorter than a page.
     * Education and the experience history can both outgrow the space left on a
     * page, so they break between their own atomic entries instead.
     */
    test.each([
      ['.languages-section'],
      ['.certifications-section'],
      ['.interests-section']
    ])('%s is short enough to stay whole', (selector) => {
      expect(declaration(css, selector, 'break-inside')).toBe('avoid');
      expect(declaration(css, selector, 'page-break-inside')).toBe('avoid');
    });

    test.each([
      ['.education-section'],
      ['.experience-section']
    ])('%s breaks between entries rather than moving whole', (selector) => {
      expect(declaration(css, selector, 'break-inside')).toBe('auto');
      expect(declaration(css, selector, 'page-break-inside')).toBe('auto');
    });

    test('keeps a job heading welded to the first line of its own entry', () => {
      expect(declaration(css, '.job-header', 'break-inside')).toBe('avoid');

      ['.job-header', '.job-period', '.job-summary'].forEach((selector) => {
        expect(declaration(css, selector, 'break-after')).toBe('avoid');
        expect(declaration(css, selector, 'page-break-after')).toBe('avoid');
      });
    });

    /*
     * Exactly one forced break exists, and it is the continuation marker.
     * Chromium exposes no way to ask where a page turn landed, so the split of
     * the entry that spans both pages is decided here rather than discovered —
     * which is what makes the "continued" cue correct by construction.
     */
    test('forces exactly one page break, and only on the continuation marker', () => {
      expect(declaration(css, '.job-continuation', 'break-before')).toBe('page');
      expect(declaration(css, '.job-continuation', 'page-break-before')).toBe('always');

      const forced = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /break-before\s*:\s*(page|always|left|right)/.test(body))
        .map(([, selector]) => selector.trim());

      expect(forced).toEqual(['.job-continuation']);
      expect(css).not.toMatch(/break-after\s*:\s*(page|always|left|right)/);
    });

    test('never lets the continuation marker be stranded at the foot of a page', () => {
      expect(declaration(css, '.job-continuation', 'break-inside')).toBe('avoid');
      expect(declaration(css, '.job-continuation', 'break-after')).toBe('avoid');
    });

    test('paragraphs and list items keep orphan and widow protection', () => {
      expect(declaration(css, 'p', 'orphans')).toBe('2');
      expect(declaration(css, 'p', 'widows')).toBe('2');
      expect(declaration(css, 'li', 'orphans')).toBe('2');
      expect(declaration(css, 'li', 'widows')).toBe('2');
    });
  });

  /*
   * The single-column contract, held from both ends: no grid rule may survive
   * for the deleted wrappers, and the body must not lay itself out in columns
   * by any other route either.
   */
  describe('single column body', () => {
    test.each([
      ['.content-grid'],
      ['.primary-column'],
      ['.secondary-column']
    ])('carries no styling at all for the removed %s', (selector) => {
      expect(ruleBody(css, selector)).toBe('');
    });

    test('never puts the main column into columns of its own', () => {
      ['grid-template-columns', 'columns', 'column-count'].forEach((property) => {
        expect(declaration(css, '.main-content', property)).toBeNull();
      });
      expect(declaration(css, '.main-content', 'display')).not.toBe('grid');
    });

    /*
     * At 182mm of printable width a full-measure line runs past 105 characters,
     * which is where a reader starts losing the return sweep. The @page inset is
     * what caps it: 210mm less two side margins is the measure every block gets,
     * so text and section rules stay on one edge instead of one being inset.
     */
    test('caps the measure at 165-170mm through the page inset', () => {
      const margin = declaration(css, '@page', 'margin');
      const side = lengthValue(margin.split(/\s+/)[1]);
      const measure = 210 - 2 * side;

      expect(measure).toBeGreaterThanOrEqual(165);
      expect(measure).toBeLessThanOrEqual(170);
    });

    test('leaves the vertical page margin at the 15mm the footer geometry assumes', () => {
      expect(lengthValue(declaration(css, '@page', 'margin').split(/\s+/)[0])).toBe(15);
    });
  });

  describe('skills block', () => {
    /*
     * The skills grid was the last two-column block in the document, and it
     * interleaved exactly like the body grid used to: the visual order read
     * iOS | Android then Delivery | Architecture, while `pdftotext` extracted
     * it column-major as iOS, Delivery, Android, Architecture. One column per
     * row makes extraction order the same as reading order here too.
     */
    test('stacks the categories in one column, like the rest of the document', () => {
      expect(declaration(css, '.skills-showcase', 'grid-template-columns')).toBe('1fr');
      expect(declaration(css, '.skills-showcase', 'column-gap')).toBeNull();
    });

    test('needs no full-width escape hatch once there is only one column', () => {
      expect(ruleBody(css, '.skill-group:only-child')).toBe('');
    });

    test('sets the category and skill text at the body size', () => {
      const body = size('body', 'font-size');

      expect(size('.skill-category', 'font-size')).toBe(body);
      expect(declaration(css, '.skill-category', 'font-weight')).toBe('600');
      expect(size('.skill-list', 'font-size')).toBe(body);
      expect(lengthValue(declaration(css, '.skill-list', 'line-height')))
        .toBe(lengthValue(declaration(css, 'body', 'line-height')));
    });

    test('carries no styling for the removed dot-rating widgets', () => {
      expect(ruleBody(css, '.skill-badge')).toBe('');
      expect(ruleBody(css, '.skill-level')).toBe('');
    });
  });

  describe('job highlights', () => {
    test('hangs the bullets on a 4mm indent', () => {
      expect(declaration(css, '.job-highlights', 'padding-left')).toBe('4mm');
    });
  });

  /*
   * Round 4 tightens the rhythm to the reviewer's bands. Vertical spacing is
   * stated in pt throughout, because it is type rather than page geometry, and
   * one `section` rule now carries the whole section rhythm — the per-section
   * overrides that used to shadow it are gone.
   */
  describe('vertical rhythm', () => {
    const trailing = (selector, property = 'margin') =>
      lengthValue(declaration(css, selector, property).split(/\s+/)[2]);

    test('spaces sections 16-18pt apart from one rule', () => {
      const gap = trailing('section');

      expect(gap).toBeGreaterThanOrEqual(16);
      expect(gap).toBeLessThanOrEqual(18);
      expect(declaration(css, 'section', 'margin')).toMatch(/pt/);
    });

    test.each([
      ['.profile-section'],
      ['.skills-section']
    ])('%s no longer overrides the shared section rhythm', (selector) => {
      expect(declaration(css, selector, 'margin')).toBeNull();
    });

    test('opens the body the same distance below the identity rule', () => {
      const gap = trailing('.hero-section');

      expect(gap).toBeGreaterThanOrEqual(16);
      expect(gap).toBeLessThanOrEqual(18);
    });

    test.each([
      ['.section-title', 6, 8],
      ['.edu-entry', 8, 10],
      ['.certifications-list li', 7, 9]
    ])('%s trails between %spt and %spt', (selector, low, high) => {
      const gap = trailing(selector);

      expect(gap).toBeGreaterThanOrEqual(low);
      expect(gap).toBeLessThanOrEqual(high);
    });

    test('separates bullets by 4-5pt', () => {
      const gap = lengthValue(declaration(css, '.job-highlights li', 'margin-bottom'));

      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(5);
      expect(declaration(css, '.job-highlights li', 'margin-bottom')).toMatch(/pt$/);
    });

    test('separates skill rows and language rows on the same scale', () => {
      expect(lengthValue(declaration(css, '.skills-showcase', 'row-gap'))).toBeCloseTo(6);
      expect(lengthValue(declaration(css, '.languages-list li', 'padding').split(/\s+/)[2]))
        .toBeCloseTo(4);
    });

    test('runs body copy at 1.25-1.3 leading, and the running copy with it', () => {
      ['body', '.job-summary', '.job-highlights li', '.profile-summary'].forEach((selector) => {
        const leading = lengthValue(declaration(css, selector, 'line-height'));

        expect(leading).toBeGreaterThanOrEqual(1.25);
        expect(leading).toBeLessThanOrEqual(1.3);
      });
    });

    /*
     * Hierarchy has to come from space, not from weight alone: a clear band
     * before each role, a tighter one inside the heading group.
     */
    describe('job entry separation', () => {
      test('opens 12-14pt before every role heading but the first', () => {
        const lead = lengthValue(declaration(css, '.job-entry + .job-entry', 'margin-top'));

        expect(lead).toBeGreaterThanOrEqual(12);
        expect(lead).toBeLessThanOrEqual(14);
        expect(declaration(css, '.job-entry + .job-entry', 'margin-top')).toMatch(/pt$/);
        expect(declaration(css, '.job-entry', 'margin')).toMatch(/^0( 0)*$|^0$/);
      });

      /*
       * Inside the heading group the gaps stay well under the 12-14pt that
       * opens a role, or the group stops reading as one unit.
       */
      test.each([
        ['.job-header'],
        ['.job-period'],
        ['.job-note'],
        ['.job-summary']
      ])('%s is followed by 3.5-6pt', (selector) => {
        const gap = lengthValue(declaration(css, selector, 'margin'));

        expect(gap).toBe(0);
        const after = lengthValue(declaration(css, selector, 'margin').split(/\s+/)[2]);
        expect(after).toBeGreaterThanOrEqual(3.5);
        expect(after).toBeLessThanOrEqual(6);
        expect(after).toBeLessThan(
          lengthValue(declaration(css, '.job-entry + .job-entry', 'margin-top'))
        );
      });
    });
  });

  describe('typography scale', () => {
    test('name sits between 26 and 28pt', () => {
      const value = size('.hero-name', 'font-size');
      expect(value).toBeGreaterThanOrEqual(26);
      expect(value).toBeLessThanOrEqual(28);
    });

    test('job title sits between 12 and 13pt', () => {
      const value = size('.hero-title', 'font-size');
      expect(value).toBeGreaterThanOrEqual(12);
      expect(value).toBeLessThanOrEqual(13);
    });

    test('body text sits between 9.5 and 10pt with 1.25-1.3 leading', () => {
      const value = size('body', 'font-size');
      expect(value).toBeGreaterThanOrEqual(9.5);
      expect(value).toBeLessThanOrEqual(10);

      const leading = lengthValue(declaration(css, 'body', 'line-height'));
      expect(leading).toBeGreaterThanOrEqual(1.25);
      expect(leading).toBeLessThanOrEqual(1.3);
    });

    test('the running copy inherits that body size', () => {
      ['.job-summary', '.job-highlights li', '.profile-summary'].forEach((selector) => {
        expect(size(selector, 'font-size')).toBe(size('body', 'font-size'));
      });
    });

    /*
     * The two new identity lines: the subtitle qualifies the title, so it sits
     * below it in size and weight; the availability note sits below the body.
     */
    test('sets the subtitle at ~10.5pt, regular weight, muted', () => {
      expect(size('.hero-subtitle', 'font-size')).toBeCloseTo(10.5);
      expect(declaration(css, '.hero-subtitle', 'font-weight')).toBe('400');
      expect(declaration(css, '.hero-subtitle', 'color')).toBe('#4b5563');
      expect(size('.hero-subtitle', 'font-size')).toBeLessThan(size('.hero-title', 'font-size'));
      expect(declaration(css, '.hero-subtitle', 'text-transform')).toBe('none');
    });

    test('keeps the availability line small and low contrast', () => {
      const value = size('.hero-availability', 'font-size');

      expect(value).toBeLessThan(size('body', 'font-size'));
      expect(declaration(css, '.hero-availability', 'color')).toBe('#4b5563');
    });

    /*
     * The note is an aside on the period above it: never louder than the dates
     * it qualifies, and never as loud as the bullets underneath.
     */
    test('sets the job note small and low contrast, under the period line', () => {
      const value = size('.job-note', 'font-size');

      expect(value).toBeLessThan(size('body', 'font-size'));
      expect(value).toBeLessThanOrEqual(size('.job-period', 'font-size'));
      expect(declaration(css, '.job-note', 'color')).toBe('#6b7280');
    });

    test('dates stay a step below the body at 8.75-9.5pt', () => {
      const value = size('.job-period', 'font-size');
      expect(value).toBeGreaterThanOrEqual(8.75);
      expect(value).toBeLessThanOrEqual(9.5);
      expect(value).toBeLessThan(size('body', 'font-size'));
    });

    test('role titles sit between 11.5 and 12pt', () => {
      const value = size('.job-title', 'font-size');
      expect(value).toBeGreaterThanOrEqual(11.5);
      expect(value).toBeLessThanOrEqual(12);
      expect(size('.job-company', 'font-size')).toBe(value);
    });

    test('section headings sit between 12.5 and 13pt', () => {
      const value = size('.section-title span:last-child', 'font-size');
      expect(value).toBeGreaterThanOrEqual(12.5);
      expect(value).toBeLessThanOrEqual(13);
    });

    test('keeps the three levels of heading distinct and ordered', () => {
      expect(size('.section-title span:last-child', 'font-size'))
        .toBeGreaterThan(size('.job-title', 'font-size'));
      expect(size('.job-title', 'font-size')).toBeGreaterThan(size('body', 'font-size'));
    });
  });

  describe('profile summary', () => {
    /*
     * With one column the page inset is already the measure, so the summary
     * must not keep a private narrower one — that only leaves it visibly out of
     * line with the bullets underneath it.
     */
    test('is left aligned and takes the column measure the page inset caps', () => {
      expect(declaration(css, '.profile-summary', 'text-align')).toBe('left');
      expect(declaration(css, '.profile-summary', 'max-width')).toBe('none');
    });
  });

  describe('header footprint', () => {
    test('keeps the portrait between 28 and 30mm with a hairline border and no shadow', () => {
      const width = size('.profile-image-wrapper img', 'width');
      expect(width).toBeGreaterThanOrEqual(28);
      expect(width).toBeLessThanOrEqual(30);
      expect(size('.profile-image-wrapper img', 'height')).toBe(width);

      expect(declaration(css, '.profile-image-wrapper img', 'border')).toMatch(/^0\.5pt solid/);
      expect(declaration(css, '.profile-image-wrapper img', 'box-shadow')).toBe('none');
    });

    test('centres the portrait against the identity block instead of top-aligning it', () => {
      expect(declaration(css, '.hero-content', 'align-items')).toBe('center');
    });

    test('reserves exactly the portrait width in the header grid', () => {
      const track = declaration(css, '.hero-content', 'grid-template-columns');
      const portrait = declaration(css, '.profile-image-wrapper img', 'width');

      expect(track).toBe(`1fr ${portrait}`);
    });
  });

  describe('contact lines', () => {
    test('sets the contact and social lines at 9-9.5pt', () => {
      const contact = size('.contact-line', 'font-size');
      expect(contact).toBeGreaterThanOrEqual(9);
      expect(contact).toBeLessThanOrEqual(9.5);
    });

    /*
     * The identity block is narrowed by the portrait beside it, so the contact
     * line wraps — and it was wrapping mid-number, printing `+39 329 8484` with
     * `046` alone on the next line. Half a phone number is not a number anyone
     * can dial, and half a URL is not one anyone can retype, so each contact
     * item is atomic and the line breaks between items instead.
     */
    test('never breaks a contact item across two lines', () => {
      expect(declaration(css, '.contact-link', 'white-space')).toBe('nowrap');
      expect(declaration(css, '.social-links a', 'white-space')).toBe('nowrap');
    });

    /*
     * A row is one rendered line, and it stays one: the separator glyph is an
     * atomic inline box that Chromium may break on either side of, so a row
     * allowed to wrap could leave the glyph stranded at the line edge — which
     * is exactly how a trailing `·` ended up after the email address. The rows
     * are cut short enough to fit the measure the portrait leaves, so forbidding
     * the wrap costs nothing.
     */
    test('never lets a contact row wrap', () => {
      expect(declaration(css, '.contact-line', 'white-space')).toBe('nowrap');
      expect(declaration(readProjectFile('style.css'), '.contact-line', 'white-space'))
        .toBe('nowrap');
    });

    test('strips the pill treatment from the social links', () => {
      const body = ruleBody(css, '.social-links a');

      expect(body).not.toMatch(/border-radius/);
      expect(declaration(css, '.social-links a', 'background')).toBe('none');
      expect(declaration(css, '.social-links a', 'border')).toBe('none');
    });
  });

  describe('restrained decoration and monochrome safety', () => {
    test('uses a single non-neutral accent colour', () => {
      const hexes = css.match(/#[0-9a-fA-F]{6}/g) || [];
      const accents = new Set(
        hexes
          .map((hex) => hex.toLowerCase())
          .filter((hex) => {
            const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
            return Math.max(...channels) - Math.min(...channels) > 40;
          })
      );

      expect([...accents]).toEqual(['#1f3864']);
    });

    /*
     * The accent is only ever printed as a rule or as the name, so it has to
     * survive a grayscale conversion as a dark, readable tone rather than a
     * saturated mid-blue that flattens into mush.
     */
    test('keeps the accent dark and desaturated enough for grayscale', () => {
      const [r, g, b] = [1, 3, 5].map((offset) => parseInt('#1f3864'.slice(offset, offset + 2), 16));
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      expect(luminance).toBeLessThan(90);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(80);
    });

    test('underlines links so they survive a black-and-white print', () => {
      expect(declaration(css, 'a', 'text-decoration')).toMatch(/underline/);
    });

    /*
     * Saturated blue link text competes with the accent and prints badly. The
     * href is untouched, so Chromium still emits real PDF link annotations.
     */
    test('prints links as dark text with a subtle underline, not saturated blue', () => {
      expect(declaration(css, 'a', 'color')).toBe('#1f2937');
      expect(lengthValue(declaration(css, 'a', 'text-decoration-thickness'))).toBeLessThanOrEqual(0.5);
      expect(declaration(css, 'a', 'text-underline-offset')).not.toBeNull();
    });

    test('draws its rules as hairlines in the accent', () => {
      ['.section-title', '.hero-section'].forEach((selector) => {
        const rule = declaration(css, selector, 'border-bottom');
        expect(rule).toBe('0.75px solid #1f3864');
      });
    });

    test('leaves no shaded certification or pill backgrounds', () => {
      expect(declaration(css, '.certifications-list li', 'background')).toBe('none');
      expect(ruleBody(css, '.tag')).toBe('');
    });
  });

  describe('print footer', () => {
    test('is set at 8pt in low-contrast grey', () => {
      expect(size('.page-footer', 'font-size')).toBeCloseTo(8);
      expect(declaration(css, '.page-footer', 'color')).toBe('#6b7280');
    });

    /*
     * Regression: the screen stylesheet hides `.page-footers`, and print.css
     * used to restyle it without ever showing it again — so no footer reached
     * the PDF at all.
     */
    test('undoes the screen stylesheet hiding of the footer container', () => {
      expect(declaration(css, '.page-footers', 'display')).toBe('block');
    });

    test('anchors every footer to the bottom of its own page from one geometry constant', () => {
      expect(declaration(css, '.page-footer', 'position')).toBe('absolute');

      // A4 height less the top and bottom @page margins.
      expect(lengthValue(declaration(css, ':root', '--page-content-height'))).toBe(267);

      // The offset is derived per footer, not hard-coded page by page.
      const top = declaration(css, '.page-footer', 'top');
      expect(top).toMatch(/--page-index/);
      expect(top).toMatch(/--page-content-height/);
      expect(ruleBody(css, '.page-footer:nth-child(1)')).toBe('');
      expect(ruleBody(css, '.page-footer:nth-child(2)')).toBe('');
    });
  });

  /*
   * Regression: the separator was a CSS `content: ' · '`, whose spaces Chromium
   * collapsed away in print — the PDF read `github.com/PigLardLord·linkedin...`
   * with the two links welded together. Real margins on a real element cannot
   * collapse.
   */
  /*
   * The year needed its own line only while education sat in a 51mm sidebar and
   * a long school name wrapped away from it. At the full 168mm measure the pair
   * fits on one line, so the year belongs back beside the school it dates.
   */
  describe('education entries at full measure', () => {
    test('sets the year inline beside the school again', () => {
      expect(declaration(css, '.edu-period', 'display')).toBe('inline');
      expect(declaration(css, '.edu-period', 'margin-left')).not.toBeNull();
    });

    test('keeps the year quieter than the school it belongs to', () => {
      expect(size('.edu-period', 'font-size')).toBeLessThan(size('.edu-school', 'font-size'));
      expect(declaration(css, '.edu-period', 'color')).toBe('#6b7280');
    });
  });

  describe('inline separators', () => {
    test('holds 0.4em clear either side of the separator glyph', () => {
      const margin = declaration(css, '.inline-separator', 'margin');

      expect(margin).toMatch(/0\.4em/);
      expect(lengthValue(margin)).toBe(0);
    });

    test('keeps the separator out of the link underline', () => {
      expect(declaration(css, '.inline-separator', 'display')).toBe('inline-block');
      expect(declaration(css, '.inline-separator', 'text-decoration')).toBe('none');
    });

    /*
     * The location used to be joined to the contact line by a generated
     * `::after` glyph, which made it the one separator no renderer could see or
     * place. It is a real separator element now, like every other one.
     */
    test('no longer joins the location with generated content', () => {
      expect(ruleBody(css, '.contact-location:not(:empty)::after')).toBe('');
      expect(ruleBody(readProjectFile('style.css'), '.contact-location:not(:empty)::after'))
        .toBe('');
    });

    test('no longer joins the social links with generated content', () => {
      expect(ruleBody(css, '.social-links a + a::before')).toBe('');
    });
  });

  describe('page-two continuation cue', () => {
    /*
     * Regression: the screen stylesheet hides `.job-continuation` — there are no
     * pages on screen to continue — and print.css styled it without ever showing
     * it again, so the cue never reached the PDF at all. Exactly the trap that
     * once swallowed the footers.
     */
    test('undoes the screen stylesheet hiding of the continuation block', () => {
      expect(declaration(css, '.job-continuation', 'display')).toBe('block');
      expect(readProjectFile('style.css')).toMatch(/\.job-continuation\s*\{[^}]*display:\s*none/);
    });

    test('sets the running header at 8.5pt in low-contrast grey', () => {
      expect(size('.running-header', 'font-size')).toBeCloseTo(8.5);
      expect(declaration(css, '.running-header', 'color')).toBe('#6b7280');
    });

    test('stacks the running header above the continued cue', () => {
      expect(declaration(css, '.running-header', 'display')).toBe('block');
      expect(declaration(css, '.continuation-label', 'display')).toBe('block');
    });

    test('sets the continued cue as a quiet heading, not body copy', () => {
      const value = size('.continuation-label', 'font-size');

      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(11.5);
      expect(declaration(css, '.continuation-label', 'font-weight')).toBe('600');
    });

    test('separates the cue from the bullets that follow it', () => {
      expect(lengthValue(declaration(css, '.job-continuation', 'margin')))
        .toBeGreaterThanOrEqual(0);
      expect(declaration(css, '.job-continuation', 'padding')).not.toBeNull();
    });
  });

  describe('empty sections', () => {
    /*
     * The renderers mark an empty section `hidden`; print.css leans on
     * `!important` everywhere, so the hiding rule has to shout at least as loud
     * or the heading and its rule come back.
     */
    test('collapses a hidden section completely', () => {
      expect(declaration(css, '[hidden]', 'display')).toBe('none');
      expect(ruleBody(css, '[hidden]')).toMatch(/!important/);
    });
  });
});

import { JSDOM } from 'jsdom';
import { readProjectFile, declaration, atRuleBody } from './helpers/cssRules.js';
import { separatorFaults } from './helpers/separators.js';
import { HeaderRenderer } from '../renderers/HeaderRenderer.js';
import { SocialLinksRenderer } from '../renderers/SocialLinksRenderer.js';
import { PrintFooterRenderer } from '../renderers/PrintFooterRenderer.js';
import { ExperienceRenderer } from '../renderers/ExperienceRenderer.js';
import { ContinuationMarker } from '../renderers/ContinuationMarker.js';

/*
 * One rule, checked wherever a separator is rendered: the glyph may only ever
 * appear between two items of the same rendered line. At a line edge it reads
 * as a typo — a CV that ends a line with `·` looks broken, whatever the
 * typography around it is worth.
 *
 * There are two ways to keep it, and which one applies depends on whether the
 * line can wrap. A line that cannot wrap may use separator elements, because no
 * break can fall beside them. A line that can wrap has to carry its separators
 * in text, bound to their neighbours by no-break spaces, so the line still
 * breaks between words and nowhere else.
 */
describe('separator placement', () => {
  const data = {
    name: 'Giovanni Trovato',
    title: 'Senior Mobile / Platform Engineer',
    subtitle: 'iOS · Android · CI/CD · Mobile Device Management',
    location: 'Bad Liebenstein, Thuringia, Germany',
    email: 'trovato.giovanni@gmail.com',
    phone: '+39 329 8484 046',
    availability: 'EU citizen · unrestricted German work authorization · available immediately',
    social: [
      { platform: 'GitHub', url: 'https://github.com/PigLardLord' },
      { platform: 'LinkedIn', url: 'https://www.linkedin.com/in/piglardlord/' }
    ],
    relevant_experience: [
      {
        title: 'Mobile Software Engineer',
        company: 'Cortado Mobile Solutions',
        period: 'August 2018 – November 2026',
        highlights: ['Raised UI-test coverage.', 'Owned the CI/CD pipelines.']
      }
    ]
  };

  let document;

  /*
   * The cut is measured from the rendered layout, so a unit test has no real
   * measurement to offer: these stand in for one, forcing the split that puts
   * a continuation cue on the page for the separator rules to inspect.
   */
  const cutFirstEntryAt = (index) => {
    const marker = new ContinuationMarker();
    let seen = 0;
    marker.cutFor = () => (seen++ === 0 ? index : null);
    return marker;
  };

  const footerFor = (pageCount) => {
    const renderer = new PrintFooterRenderer();
    renderer.setPageCount(pageCount);
    return renderer;
  };

  beforeEach(() => {
    document = new JSDOM(readProjectFile('index.html')).window.document;

    [
      new HeaderRenderer(),
      new SocialLinksRenderer(),
      new ExperienceRenderer(cutFirstEntryAt(1)),
      footerFor(2)
    ].forEach((renderer) => renderer.render(document, data));
  });

  test('strands no separator anywhere in the rendered document', () => {
    expect(separatorFaults(document.body)).toEqual([]);
  });

  test.each([
    ['the contact block', '#contacts'],
    ['the social links row', '.social-links'],
    ['the specialisation line', '#subtitle'],
    ['the availability line', '#availability'],
    ['the page-two continuation cue', '.job-continuation'],
    ['the page footers', '.page-footers']
  ])('strands no separator in %s', (_, selector) => {
    const line = document.querySelector(selector);

    expect(line).not.toBeNull();
    expect(line.textContent).toContain('·');
    expect(separatorFaults(line)).toEqual([]);
  });

  /*
   * The identity block is the one that reported the defect: three deliberate
   * rows, each self-contained, instead of one inline run wrapping where the
   * portrait happens to cut it off.
   */
  test('renders the contact block as three self-contained rows', () => {
    const rows = [
      ...document.querySelectorAll('#contacts .contact-line'),
      document.querySelector('.social-links')
    ];

    expect(rows.map((row) => row.textContent)).toEqual([
      'Bad Liebenstein, Thuringia, Germany·trovato.giovanni@gmail.com',
      '+39 329 8484 046',
      'github.com/PigLardLord·linkedin.com/in/piglardlord'
    ]);
  });

  test('ends no rendered line with a separator', () => {
    [...document.querySelectorAll('#contacts .contact-line, .social-links, #subtitle, #availability, .continuation-label, .page-footer')]
      .forEach((line) => {
        expect(line.textContent.trim()).not.toMatch(/·$/);
        expect(line.textContent.trim()).not.toMatch(/^·/);
      });
  });

  /*
   * Below the width where the longest row fits, the row stops being a row: each
   * item takes a line of its own and the separators that no longer join
   * anything are dropped. Wrapping the row instead would strand one.
   */
  describe('the narrow screen fallback', () => {
    const screen = readProjectFile('style.css');
    const narrow = atRuleBody(screen, '@media (max-width: 600px)');

    test('stacks the items of a row one per line', () => {
      expect(declaration(narrow, '.contact-line', 'white-space')).toBe('normal');
      expect(declaration(narrow, '.contact-line > *', 'display')).toBe('block');
    });

    test('drops the separators once they join nothing', () => {
      expect(declaration(narrow, '.contact-line .inline-separator', 'display')).toBe('none');
    });
  });
});

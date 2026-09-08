import { JSDOM } from 'jsdom';
import { ContinuationMarker } from '../renderers/ContinuationMarker.js';

const NO_BREAK_SPACE = '\u00A0';

/**
 * The line as it is written above, with each separator bound to its neighbours:
 * an ordinary space beside the glyph is a break opportunity, and a wrap there
 * would strand the separator at the edge of the line.
 */
const bound = (text) => text.replace(/ · /g, `${NO_BREAK_SPACE}·${NO_BREAK_SPACE}`);

describe('ContinuationMarker', () => {
  let document;

  beforeEach(() => {
    document = new JSDOM('<!DOCTYPE html><html><body></body></html>').window.document;
  });

  const job = {
    title: 'Mobile Software Engineer — iOS & Android',
    company: 'Cortado Mobile Solutions',
    period: 'August 2018 – November 2026'
  };
  const data = { name: 'Giovanni Trovato', title: 'Senior Mobile Engineer · iOS & Android' };
  const marker = (cuts = new Map()) => new ContinuationMarker({ cuts });

  describe('deciding where the page turns', () => {
    test('reports the cut the measured layout found for this entry', () => {
      expect(marker(new Map([[0, 4]])).cutFor(0)).toBe(4);
    });

    test('reports nothing for an entry that was not cut', () => {
      expect(marker(new Map([[0, 4]])).cutFor(1)).toBeNull();
    });

    /*
     * The regression that made the cue vanish: the split used to be matched by
     * employer name, so renaming the company in the data silently removed it.
     * Entries are keyed by position now — no name is read at all.
     */
    test('is unaffected by the employer named in the data', () => {
      expect(marker(new Map([[1, 3]])).cutFor(1)).toBe(3);
    });

    /*
     * The other way the same failure arrives: keying by element looks stable,
     * but applying a cut re-renders the section and every measured element is
     * detached, so the lookup silently misses on the pass that matters.
     */
    test('survives the re-render that applying a cut causes', () => {
      const cuts = new Map([[0, 2]]);
      const measured = marker(cuts);

      document.body.innerHTML = '';       // the re-render throws the DOM away
      expect(measured.cutFor(0)).toBe(2); // the cut still lands
    });

    /*
     * Breaking before the first highlight would move the whole entry, leaving
     * a heading with no body on page one rather than a continuation.
     */
    test('never applies before the first highlight', () => {
      expect(marker(new Map([[0, 0]])).cutFor(0)).toBeNull();
    });

    test('an unmeasured marker never applies', () => {
      expect(new ContinuationMarker().cutFor(0)).toBeNull();
      expect(new ContinuationMarker({}).cutFor(0)).toBeNull();
    });
  });

  describe('the marker it builds', () => {
    const build = () => marker().create(document, job, data);

    test('is a single block that carries the forced page break', () => {
      const element = build();

      expect(element.tagName).toBe('DIV');
      expect(element.className).toBe('job-continuation');
    });

    /*
     * A bare company name is not enough to re-enter the entry on page two: the
     * reader arrives at a run of bullets with no idea which role they belong
     * to. The cue repeats the whole compact header — role, employer, years —
     * with the period reduced to its years so the line stays one line.
     */
    test('repeats the full compact header with an explicit continued cue', () => {
      const label = build().querySelector('.continuation-label');

      expect(label).not.toBeNull();
      expect(label.textContent).toBe(
        bound('Mobile Software Engineer — iOS & Android · Cortado Mobile Solutions · 2018–2026 (continued)')
      );
    });

    test('localizes the continuation cue used in the PDF', () => {
      const i18n = { t: () => 'Fortsetzung' };
      const label = new ContinuationMarker({ i18n })
        .create(document, { title: 'Entwickler', company: 'Acme' }, data)
        .querySelector('.continuation-label');

      expect(label.textContent).toBe(bound('Entwickler · Acme (Fortsetzung)'));
    });

    /*
     * The cue is long enough to wrap on page two, so every separator in it has
     * to be bound to its neighbours — including one the entry's own title
     * brought with it, which we neither wrote nor may reword.
     */
    test('binds a separator the entry title brought with it', () => {
      const label = new ContinuationMarker()
        .create(document, { title: 'Developer · iOS', company: 'Acme' }, data)
        .querySelector('.continuation-label');

      expect(label.textContent).toBe(bound('Developer · iOS · Acme (continued)'));
    });

    test('reduces a single-year period to that year', () => {
      const label = new ContinuationMarker()
        .create(document, { title: 'Developer', company: 'Acme', period: 'May 2015' }, data)
        .querySelector('.continuation-label');

      expect(label.textContent).toBe(bound('Developer · Acme · 2015 (continued)'));
    });

    test.each([
      ['no period', { title: 'Developer', company: 'Acme' }, bound('Developer · Acme (continued)')],
      ['a yearless period', { title: 'Developer', company: 'Acme', period: 'ongoing' }, bound('Developer · Acme (continued)')],
      ['no title', { company: 'Acme', period: '2015 – 2018' }, bound('Acme · 2015–2018 (continued)')],
      ['company only', { company: 'Acme' }, 'Acme (continued)']
    ])('degrades to the parts it has when the entry has %s', (_label, entry, expected) => {
      const label = new ContinuationMarker()
        .create(document, entry, data)
        .querySelector('.continuation-label');

      expect(label.textContent).toBe(expected);
    });

    /*
     * The gap either side of the separator is a CSS margin, never text, so the
     * assertion is on the parts rather than on a spaced string.
     */
    test('carries the running header identifying the page', () => {
      const header = build().querySelector('.running-header');

      expect(header).not.toBeNull();
      expect([...header.children].map((child) => child.textContent))
        .toEqual(['Giovanni Trovato', '·', 'Senior Mobile Engineer']);
    });

    test('spaces the running header separator with a real element', () => {
      const separators = build().querySelectorAll('.running-header .inline-separator');

      expect(separators).toHaveLength(1);
      expect(separators[0].getAttribute('aria-hidden')).toBe('true');
    });

    test('puts the running header above the continuation cue', () => {
      const classes = [...build().children].map((child) => child.className);

      expect(classes).toEqual(['running-header', 'continuation-label']);
    });

    test('drops the qualifier after the title separator', () => {
      const header = new ContinuationMarker()
        .create(document, { company: 'Acme' }, { name: 'Ada Lovelace', title: 'Engineer · Web · Mobile' })
        .querySelector('.running-header');

      expect([...header.children].map((child) => child.textContent))
        .toEqual(['Ada Lovelace', '·', 'Engineer']);
    });

    test('omits the running header when there is no identity to show', () => {
      const element = new ContinuationMarker()
        .create(document, { company: 'Acme' }, {});

      expect(element.querySelector('.running-header')).toBeNull();
      expect(element.querySelector('.continuation-label').textContent).toBe('Acme (continued)');
    });
  });
});

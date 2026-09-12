import { fallbackRuns, typefacesFor } from '../scripts/lib/printed-typefaces.mjs';

// What `pdftohtml -xml` writes for a page Chrome printed: each face declared once, under the subset
// tag the PDF embeds it with, and every run of text pointing at one. The ids run across the whole
// document, so a face declared on the first page can set text on the second.
const fontspec = (id, family) =>
  `\t<fontspec id="${id}" size="15" family="${family}" color="#374150"/>`;
const run = (font, text) =>
  `<text top="40" left="60" width="200" height="20" font="${font}">${text}</text>`;
const pdf = (...pages) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<pdf2xml producer="poppler" version="26.01.0">',
    ...pages.map(
      (lines, index) =>
        `<page number="${index + 1}" position="absolute" top="0" left="0" height="1262" width="892">\n${lines.join('\n')}\n</page>`
    ),
    '</pdf2xml>'
  ].join('\n');

const spotlight = typefacesFor('spotlight');
const technical = typefacesFor('technical');

describe('text a printed page set in a typeface its layout does not print in', () => {
  test('Impact Spotlight, its name in Instrument Serif and the rest in Inter, has none', () => {
    const page = pdf([
      fontspec(0, 'AAAAAA+Inter'),
      fontspec(1, 'IAAAAA+InstrumentSerif'),
      run(1, 'Giovanni Trovato'),
      run(0, 'Senior iOS Engineer')
    ]);

    expect(fallbackRuns(page, spotlight)).toEqual([]);
  });

  // Measured on main: Technical Profile printed its name in Liberation Serif, with Inter embedded for
  // every other line — and Inter being embedded was all the old check looked for.
  test('names a run set in a fallback, even with Inter embedded beside it', () => {
    const page = pdf([
      fontspec(0, 'AAAAAA+Inter'),
      fontspec(16, 'IAAAAA+LiberationSerif'),
      run(16, 'Giovanni Trovato'),
      run(0, 'Senior iOS Engineer / Mobile Platform Owner')
    ]);

    expect(fallbackRuns(page, technical)).toEqual([
      { face: 'LiberationSerif', text: 'Giovanni Trovato' }
    ]);
  });

  // Technical Profile's screen never loads Instrument Serif. A name printed in it means print asked
  // for a face on its own, and won a race it can also lose — which is #68 passing on a lucky run.
  test("Technical Profile's name in Instrument Serif is a face that layout does not print in", () => {
    const page = pdf([
      fontspec(0, 'AAAAAA+Inter'),
      fontspec(22, 'IAAAAA+InstrumentSerif'),
      run(22, 'Giovanni Trovato'),
      run(0, 'Senior iOS Engineer / Mobile Platform Owner')
    ]);

    expect(fallbackRuns(page, technical)).toEqual([
      { face: 'InstrumentSerif', text: 'Giovanni Trovato' }
    ]);
  });

  test('a layout with no faces declared is refused, not waved through', () => {
    expect(() => typefacesFor('magazine')).toThrow(/magazine/);
    expect(() => typefacesFor('constructor')).toThrow(/constructor/);
  });

  test('follows a face declared on one page to the text it sets on the next', () => {
    const document = pdf(
      [fontspec(0, 'AAAAAA+Inter'), run(0, 'Professional Experience')],
      [
        fontspec(7, 'JAAAAA+LiberationSans'),
        run(0, 'Education'),
        run(7, 'September 2015 – July 2018')
      ]
    );

    expect(fallbackRuns(document, technical)).toEqual([
      { face: 'LiberationSans', text: 'September 2015 – July 2018' }
    ]);
  });

  test('reports the text as a reader sees it, without the markup around it', () => {
    const page = pdf([
      fontspec(3, 'EAAAAA+DejaVuSans'),
      run(
        3,
        '<a href="https://github.com/PigLardLord"><b>signing &amp; provisioning, the app&#39;s</b></a>'
      )
    ]);

    expect(fallbackRuns(page, technical)).toEqual([
      { face: 'DejaVuSans', text: "signing & provisioning, the app's" }
    ]);
  });

  test('does not report a run with nothing visible in it', () => {
    const page = pdf([
      fontspec(0, 'AAAAAA+Inter'),
      fontspec(1, 'BAAAAA+LiberationSans'),
      run(1, '   '),
      run(0, 'Languages')
    ]);

    expect(fallbackRuns(page, technical)).toEqual([]);
  });

  // A run whose face the file never declared cannot be shown to be in the intended one, so it counts
  // against the page rather than for it.
  test('counts a run that points at an undeclared face against the page', () => {
    const page = pdf([fontspec(0, 'AAAAAA+Inter'), run(9, 'Interests')]);

    expect(fallbackRuns(page, technical)).toEqual([{ face: 'undeclared', text: 'Interests' }]);
  });

  // Inter Tight is a family of its own, as is anything else whose name only begins with Inter.
  test('a family whose name only begins with an intended one is another face', () => {
    const page = pdf([fontspec(1, 'InterTight'), run(1, 'World')]);

    expect(fallbackRuns(page, technical)).toEqual([{ face: 'InterTight', text: 'World' }]);
  });

  test.each(['Inter', 'BAAAAA+Inter', 'IAAAAA+Inter-Bold', 'IAAAAA+InstrumentSerif'])(
    '%s is a face Impact Spotlight prints in',
    (family) => {
      expect(
        fallbackRuns(pdf([fontspec(0, family), run(0, 'Giovanni Trovato')]), spotlight)
      ).toEqual([]);
    }
  );
});

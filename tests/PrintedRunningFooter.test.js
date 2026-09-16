/**
 * @jest-environment node
 */
import { PRINTED_PAGE, bboxPages } from '../scripts/lib/page-room.mjs';
import {
  RUNNING_FOOTER_FLOOR_MM,
  footerBoxes,
  paintedWhite,
  runningFooterFindings,
  textPages,
  withoutRunningFooter
} from '../scripts/lib/running-footer.mjs';

// Page 2 of the printed CV said neither whose CV it was nor that a page 1 existed (#158). The print audit looks for the
// line that says so on the paper: from page 2 on, a line of its own, in the bottom margin, clear of the paper's edge,
// and at the page's end in both reading orders; and on page 1, nowhere.
const parts = ['Ada Lovelace · CV · ', { counter: 'page' }, '/', { counter: 'pages' }];

const escaped = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const line = (text, yMin, yMax, xMin = 39, xMax = 300) =>
  `<line xMin="${xMin}" yMin="${yMin}" xMax="${xMax}" yMax="${yMax}">${text
    .split(' ')
    .map(
      (word) =>
        `<word xMin="${xMin}" yMin="${yMin}" xMax="${xMax}" yMax="${yMax}">${escaped(word)}</word>`
    )
    .join('')}</line>`;
const page = (...lines) =>
  `<page width="594.96" height="841.92"><flow><block>${lines.join('')}</block></flow></page>`;
const extract = (...pages) => `<doc>${pages.join('')}</doc>`;

// As Chrome prints it: 10pt Inter, top-aligned in the 33pt bottom margin, against the right-hand margin.
const footerOn = (number, count = 2, yMin = 809.5, yMax = 821.6) =>
  line(`Ada Lovelace · CV · ${number}/${count}`, yMin, yMax, 450, 556);
const nameLine = line('Ada Lovelace', 31.5, 60.5);
const roleLine = line('Analyst at Analytical Engines', 33, 48.4);
const lastLine = line('Chess, Mathematics', 780, 795.4);

// pdftotext ends every page with a form feed. Read as poppler lays the page out, the footer is the page's last line;
// read in drawing order, Chrome draws a margin box before the page's content, so it is the first.
const printed = ({ pages, read, drawn }) => ({
  pages: bboxPages(extract(...pages)),
  read: `${read.join('\f')}\f`,
  drawn: `${drawn.join('\f')}\f`
});
const sound = {
  pages: [page(nameLine), page(roleLine, lastLine, footerOn(2))],
  read: [
    'Ada Lovelace\n\n',
    'Analyst at Analytical Engines\n\nChess, Mathematics\n\nAda Lovelace · CV · 2/2\n\n'
  ],
  drawn: [
    'Ada Lovelace\n',
    'Ada Lovelace · CV · 2/2\nAnalyst at Analytical Engines\nChess, Mathematics\n'
  ]
};
const settings = { parts, bottomMargin: PRINTED_PAGE.bottomMargin };

describe("the printed CV's running footer, as the print audit finds it", () => {
  test('reads each page of an extract as its lines, split on the form feed poppler ends a page with', () => {
    expect(textPages('Ada Lovelace\n\n  Analyst \f\nChess\n\f')).toEqual([
      ['Ada Lovelace', 'Analyst'],
      ['Chess']
    ]);
  });

  test('a CV that names its candidate on every page from the second is sound', () => {
    expect(runningFooterFindings(printed(sound), settings)).toEqual([]);
  });

  test('every page from the second counts itself, and page 3 of 3 says so', () => {
    const three = {
      pages: [page(nameLine), page(roleLine, footerOn(2, 3)), page(lastLine, footerOn(3, 3))],
      read: [
        'Ada Lovelace\n',
        'Analyst at Analytical Engines\nAda Lovelace · CV · 2/3\n',
        'Chess, Mathematics\nAda Lovelace · CV · 3/3\n'
      ],
      drawn: [
        'Ada Lovelace\n',
        'Ada Lovelace · CV · 2/3\nAnalyst at Analytical Engines\n',
        'Chess, Mathematics\nAda Lovelace · CV · 3/3\n'
      ]
    };

    expect(runningFooterFindings(printed(three), settings)).toEqual([]);
    expect(
      runningFooterFindings(
        printed({
          ...three,
          pages: [three.pages[0], three.pages[1], page(lastLine, footerOn(2, 3))]
        }),
        settings
      )
    ).toEqual([
      expect.stringMatching(/^page 3 carries no line reading "Ada Lovelace · CV · 3\/3"/)
    ]);
  });

  test('a page 2 that does not say whose CV it is fails', () => {
    const bare = {
      pages: [page(nameLine), page(roleLine, lastLine)],
      read: ['Ada Lovelace\n', 'Analyst at Analytical Engines\nChess, Mathematics\n'],
      drawn: ['Ada Lovelace\n', 'Analyst at Analytical Engines\nChess, Mathematics\n']
    };

    expect(runningFooterFindings(printed(bare), settings)).toEqual([
      'page 2 carries no line reading "Ada Lovelace · CV · 2/2"'
    ]);
  });

  // Page 1 opens on the name already, and a footer there is the stylesheet's `@page :first` rule gone.
  test('a page 1 that carries the footer fails', () => {
    const first = {
      ...sound,
      pages: [page(nameLine, footerOn(1)), sound.pages[1]],
      read: ['Ada Lovelace\nAda Lovelace · CV · 1/2\n', sound.read[1]],
      drawn: ['Ada Lovelace · CV · 1/2\nAda Lovelace\n', sound.drawn[1]]
    };

    expect(runningFooterFindings(printed(first), settings)).toEqual([
      'page 1 carries the running footer "Ada Lovelace · CV · 1/2"'
    ]);
  });

  test('a footer that runs into the text block fails', () => {
    const high = {
      ...sound,
      pages: [sound.pages[0], page(roleLine, lastLine, footerOn(2, 2, 800, 812.1))]
    };

    expect(runningFooterFindings(printed(high), settings)).toEqual([
      "page 2's running footer starts 8.9pt above the 33pt bottom margin, in the text block"
    ]);
  });

  // Office printers leave about 4 to 5mm of the sheet unprinted, and a footer there is cut off.
  test(`a footer closer than ${RUNNING_FOOTER_FLOOR_MM}mm to the paper's edge fails`, () => {
    const low = {
      ...sound,
      pages: [sound.pages[0], page(roleLine, lastLine, footerOn(2, 2, 818, 830.1))]
    };

    expect(RUNNING_FOOTER_FLOOR_MM).toBe(6);
    expect(runningFooterFindings(printed(low), settings)).toEqual([
      "page 2's running footer ends 4.2mm from the paper's edge, under the 6mm floor"
    ]);
    // 6mm is 17.0pt: a footer ending 17.1pt above the edge clears it.
    const clear = {
      ...sound,
      pages: [sound.pages[0], page(roleLine, lastLine, footerOn(2, 2, 812.7, 824.8))]
    };
    expect(runningFooterFindings(printed(clear), settings)).toEqual([]);
  });

  test('a footer read before the end of its page, as poppler lays the page out, fails', () => {
    const early = {
      ...sound,
      read: [
        sound.read[0],
        'Analyst at Analytical Engines\nAda Lovelace · CV · 2/2\nChess, Mathematics\n'
      ]
    };

    expect(runningFooterFindings(printed(early), settings)).toEqual([
      'page 2\'s running footer is not its last line as poppler reads the page: "Chess, Mathematics" is'
    ]);
  });

  test('a footer drawn in the middle of its page fails', () => {
    const middle = {
      ...sound,
      drawn: [
        sound.drawn[0],
        'Analyst at Analytical Engines\nAda Lovelace · CV · 2/2\nChess, Mathematics\n'
      ]
    };

    expect(runningFooterFindings(printed(middle), settings)).toEqual([
      "page 2's running footer is neither the first nor the last line the page draws"
    ]);
    // Drawn last, it is at the page's end as well.
    const last = {
      ...sound,
      drawn: [
        sound.drawn[0],
        'Analyst at Analytical Engines\nChess, Mathematics\nAda Lovelace · CV · 2/2\n'
      ]
    };
    expect(runningFooterFindings(printed(last), settings)).toEqual([]);
  });

  // A line that says more than the footer, or less, is not the footer: poppler joined it to something else.
  test('a footer joined to other text on its line is not the footer', () => {
    const joined = {
      ...sound,
      pages: [
        sound.pages[0],
        page(roleLine, lastLine, line('Ada Lovelace · CV · 2/2 Chess', 809.5, 821.6, 300, 556))
      ]
    };

    expect(runningFooterFindings(printed(joined), settings)).toEqual([
      'page 2 carries no line reading "Ada Lovelace · CV · 2/2"'
    ]);
  });

  test('a profile the footer names nobody for has nothing to find, and says so', () => {
    expect(runningFooterFindings(printed(sound), { ...settings, parts: [] })).toEqual([
      'there is no running footer to look for: the profile has no name, or the catalogue writes no page count'
    ]);
  });
});

// The room left under a page's last line measures the CV's own text (#162). The footer is left out by what it says,
// never by where it is: a line of the CV that runs into the margin must still count (the code review of #168).
describe("the page's own lines, without its running footer", () => {
  test("leaves out each page's footer and nothing else", () => {
    const pages = bboxPages(
      extract(
        page(nameLine, line('Ada Lovelace · CV · 2/2', 700, 712)),
        page(roleLine, line('Overflowing achievement', 809.5, 821.6), footerOn(2))
      )
    );

    expect(
      withoutRunningFooter(pages, parts).map((each) => each.lines.map(({ text }) => text))
    ).toEqual([
      // Page 1's footer would read 1/2; a line reading 2/2 there is not it.
      ['Ada Lovelace', 'Ada Lovelace · CV · 2/2'],
      ['Analyst at Analytical Engines', 'Overflowing achievement']
    ]);
    expect(withoutRunningFooter(pages, [])).toEqual(pages);
  });
});

// The 10mm margin floor and the symmetry of the sides hold for the CV's text. The footer is set in the margin on
// purpose, so its ink is painted out before the margins are measured, and only its own box is.
describe("the footer's ink, left out of the margin measure", () => {
  test("finds the box of each page's footer, in points", () => {
    const pages = bboxPages(extract(page(nameLine), page(roleLine, footerOn(2))));

    expect(footerBoxes(pages, parts)).toEqual([
      [],
      [{ left: 450, top: 809.5, right: 556, bottom: 821.6 }]
    ]);
    expect(footerBoxes(pages, [])).toEqual([[], []]);
  });

  // A page of 72dpi, one pixel a point: ink in the footer's box, antialiased a pixel beyond it, and a body line beside it.
  const raster = () => {
    const width = 20;
    const height = 20;
    const pixels = Buffer.alloc(width * height, 255);
    const ink = (x, y) => (pixels[y * width + x] = 0);
    ink(12, 15); // inside the footer's box
    ink(16, 17); // a pixel beyond its right and lower edges, where antialiasing lands
    ink(3, 15); // the CV's own text, beside the footer, in the margin
    ink(12, 10); // above the footer's box
    return { width, height, pixels };
  };
  const inkAt = ({ width, pixels }) =>
    [...pixels].flatMap((value, index) =>
      value < 255 ? [[index % width, Math.floor(index / width)]] : []
    );

  test("paints the footer's box white, a pixel around it, and nothing else", () => {
    const page = raster();

    const painted = paintedWhite(page, [{ left: 10, top: 14, right: 15.2, bottom: 16.4 }], 72);

    expect(inkAt(painted)).toEqual([
      [12, 10],
      [3, 15]
    ]);
    // The raster the contrast of every word is measured on is left as it was.
    expect(inkAt(page)).toEqual([
      [12, 10],
      [3, 15],
      [12, 15],
      [16, 17]
    ]);
  });

  test("scales points to the raster's resolution", () => {
    const page = raster();

    // At 144dpi a point is two pixels: 5 to 7.5pt across paints pixels 9 to 15, and 6 to 8pt down paints 11 to 16. At
    // 72dpi the same box would paint none of the ink.
    expect(inkAt(paintedWhite(page, [{ left: 5, top: 6, right: 7.5, bottom: 8 }], 144))).toEqual([
      [12, 10],
      [3, 15],
      [16, 17]
    ]);
  });

  test('a page with no footer is measured as it was printed', () => {
    const page = raster();

    expect(inkAt(paintedWhite(page, [], 72))).toEqual(inkAt(page));
  });
});

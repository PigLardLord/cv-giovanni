import { imageCount, outOfOrder } from '../scripts/lib/section-order.mjs';

// The browser's print laid Education in a column beside the first role, and its text layer put the
// degrees between that role's achievements, in every layout; read in drawing order, the name came after
// the skills (#142). A parser meets sections in the order the text layer gives them.
describe('the order a text layer gives the CV', () => {
  const anchors = [
    'Giovanni Trovato',
    'trovato.giovanni@gmail.com',
    { heading: 'Core Technologies' },
    { heading: 'Professional Experience' },
    'Mobile Software Engineer',
    'Mobile Developer',
    { heading: 'Education' },
    'B.Sc. Computer Engineering',
    { heading: 'Languages' }
  ];
  const inOrder = [
    'Giovanni Trovato',
    'Email: trovato.giovanni@gmail.com',
    'Core Technologies',
    'iOS — Swift',
    'Professional Experience',
    'Mobile Software Engineer / Technical Owner',
    'Led annual iOS compatibility',
    'Mobile Developer at Apparound',
    'Education',
    'B.Sc. Computer',
    'Engineering',
    'Languages'
  ].join('\n');

  test('a CV read top to bottom has nothing out of order, across wrapped lines', () => {
    expect(outOfOrder(inOrder, anchors)).toEqual([]);
  });

  test('names a section that begins inside another one', () => {
    const interleaved = inOrder
      .replace('Education\nB.Sc. Computer\nEngineering\n', '')
      .replace('Led annual', 'Education\nB.Sc. Computer\nEngineering\nLed annual');

    expect(outOfOrder(interleaved, anchors)).toEqual([
      '"Education" comes before "Mobile Developer"'
    ]);
  });

  test('names the header drawn after the skills', () => {
    const drawnLate = inOrder
      .replace('Giovanni Trovato\n', '')
      .replace('Professional', 'Giovanni Trovato\nProfessional');

    expect(outOfOrder(drawnLate, anchors)).toContain(
      '"trovato.giovanni@gmail.com" comes before "Giovanni Trovato"'
    );
  });

  // The code review of #156: each anchor was found from the start of the text, so a summary saying "Education"
  // before the experience failed a CV whose Education section was in its place. A section's heading is a line
  // of its own; a word in the body is not.
  test('a heading is a whole line, so a word in the body is not taken for the section', () => {
    const decoy = inOrder.replace(
      'Core Technologies',
      'Built Education technology.\nCore Technologies'
    );

    expect(outOfOrder(decoy, anchors)).toEqual([]);
  });

  // The review of that fix: reading each anchor after the one before it let a misplaced section pass whenever
  // the same word appeared later in the body.
  test('names a misplaced section even when its word appears later in the body', () => {
    const misplaced = inOrder
      .replace('Education\nB.Sc. Computer\nEngineering\n', '')
      .replace('Core Technologies', 'Education\nB.Sc. Computer\nEngineering\nCore Technologies')
      .replace(
        'Led annual iOS compatibility',
        'Taught in Education technology\nLed annual iOS compatibility'
      );

    expect(outOfOrder(misplaced, anchors)).toEqual(['"Education" comes before "Mobile Developer"']);
  });

  test('names an anchor the text does not carry', () => {
    expect(outOfOrder(inOrder.replace('Languages', ''), anchors)).toEqual([
      '"Languages" is missing'
    ]);
  });
});

describe('images in the PDF', () => {
  const list = (...rows) =>
    [
      'page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio',
      '--------------------------------------------------------------------------------------------',
      ...rows
    ].join('\n');

  // The code review of #156: a soft mask is listed as a row of its own, beside the image it belongs to.
  test('counts an image with a soft mask once', () => {
    expect(
      imageCount(
        list(
          '   1     0 image     400   400  rgb     3   8  image  no        12  0   300   300 40.1K 8.4%',
          '   1     1 smask     400   400  gray    1   8  image  no        12  0   300   300 2.1K 1.3%'
        )
      )
    ).toBe(1);
  });

  // The review of that fix: a stencil is an image drawn as ink through a one-bit mask, with no image row of its own.
  test('counts a stencil drawn alone', () => {
    expect(
      imageCount(
        list(
          '   1     0 stencil     8     8  -       1   1  image  no         5  0     6     6    8B 100%'
        )
      )
    ).toBe(1);
  });

  test('counts the images pdfimages lists, and none on a page of text', () => {
    expect(
      imageCount(
        list(
          '   1     0 image     400   400  rgb     3   8  image  no        12  0   300   300 40.1K 8.4%'
        )
      )
    ).toBe(1);
    expect(imageCount(list())).toBe(0);
  });
});

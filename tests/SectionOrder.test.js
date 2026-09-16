import { imageCount, outOfOrder } from '../scripts/lib/section-order.mjs';

// The browser's print laid Education in a column beside the first role, and its text layer put the
// degrees between that role's achievements, in every layout; read in drawing order, the name came after
// the skills (#142). A parser meets sections in the order the text layer gives them.
describe('the order a text layer gives the CV', () => {
  const anchors = [
    'Giovanni Trovato',
    'trovato.giovanni@gmail.com',
    'Core Technologies',
    'Professional Experience',
    'Mobile Software Engineer',
    'Mobile Developer',
    'Education',
    'B.Sc. Computer Engineering',
    'Languages'
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

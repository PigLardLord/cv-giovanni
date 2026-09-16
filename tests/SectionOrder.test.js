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

  // The review of that fix: "Mobile Developer" begins "Mobile Developer Intern", so with the two roles swapped the
  // shorter title was found inside the longer one and the reversal passed.
  test('does not find a title inside a longer title that shares its start', () => {
    const titles = ['Mobile Developer', 'Mobile Developer Intern'];
    const correct =
      'Mobile Developer at Apparound\nBuilt features\nMobile Developer Intern at Marte 5\nBuilt AR';
    const swapped =
      'Mobile Developer Intern at Marte 5\nBuilt AR\nMobile Developer at Apparound\nBuilt features';

    expect(outOfOrder(correct, titles)).toEqual([]);
    expect(outOfOrder(swapped, titles)).toEqual([
      '"Mobile Developer Intern" comes before "Mobile Developer"'
    ]);
  });

  test('names an anchor the text does not carry', () => {
    expect(outOfOrder(inOrder.replace('Languages', ''), anchors)).toEqual([
      '"Languages" is missing'
    ]);
  });
});

// A cover letter repeats its sender's name: in the letterhead, and again under the closing (#151). Found from the start
// of the text, the signature would be the letterhead, and every letter would read as signed before it began.
describe('an anchor the document also writes earlier', () => {
  const letter = [
    'Ada Lovelace',
    'London · ada@example.com',
    'Beispiel GmbH',
    'Dear Anna Schmidt,',
    'I write about the analyst role.',
    'Kind regards,',
    'Ada Lovelace',
    'Enclosed: CV'
  ].join('\n');
  const anchors = [
    'Ada Lovelace',
    'Beispiel GmbH',
    'Dear Anna Schmidt,',
    { heading: 'Kind regards,' },
    { following: 'Ada Lovelace' },
    'Enclosed: CV'
  ];

  test('is found after the anchor before it', () => {
    expect(outOfOrder(letter, anchors)).toEqual([]);
  });

  test('names a signature drawn before the close', () => {
    const signedEarly = letter.replace(
      'Kind regards,\nAda Lovelace',
      'Ada Lovelace\nKind regards,'
    );

    expect(outOfOrder(signedEarly, anchors)).toContain(
      '"Ada Lovelace" comes before "Kind regards,"'
    );
  });

  test('names a signature the text does not carry at all', () => {
    expect(
      outOfOrder(letter, [{ heading: 'Kind regards,' }, { following: 'Grace Hopper' }])
    ).toEqual(['"Grace Hopper" is missing']);
  });

  test('is found across a wrapped line, as a string is', () => {
    expect(
      outOfOrder('Ada\nLovelace\nKind regards,\nAda\nLovelace', [
        { heading: 'Kind regards,' },
        { following: 'Ada Lovelace' }
      ])
    ).toEqual([]);
  });
});

// A line the layout may wrap, a cover letter's date among them, is still whole lines of its own: it begins a line and ends
// one, and nothing else shares them (the review of #151).
describe('an anchor that fills whole lines', () => {
  test('is found on one line, or wrapped over several', () => {
    const anchors = ['Beispiel GmbH', { lines: 'Bad Liebenstein, September 16, 2026' }];

    expect(outOfOrder('Beispiel GmbH\nBad Liebenstein, September 16, 2026', anchors)).toEqual([]);
    expect(outOfOrder('Beispiel GmbH\nBad Liebenstein,\nSeptember 16, 2026', anchors)).toEqual([]);
  });

  test('is not found inside a longer line', () => {
    expect(
      outOfOrder('Call +49 12 345\n12 Main Street', ['Call', { lines: '12' }, { lines: 'Main' }])
    ).toEqual(['"12" is missing', '"Main" is missing']);
  });

  test('names one drawn before the anchor it follows', () => {
    expect(
      outOfOrder('16 September\nBeispiel GmbH', ['Beispiel GmbH', { lines: '16 September' }])
    ).toEqual(['"16 September" comes before "Beispiel GmbH"']);
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

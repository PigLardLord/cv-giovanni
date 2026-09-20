import { deflateSync } from 'node:zlib';
import {
  privateUseDestinations,
  toUnicodeCmaps,
  toUnicodeFonts,
  wordsLostBetween,
  xmlText
} from '../scripts/lib/extractable-text.mjs';

// A glyph reached through an OpenType feature has no Unicode of its own, so Skia writes a Private Use
// code point into the map a reader trusts. pdftotext recovers the character from the font's cmap and
// never sees it; pdftohtml and PDF.js hand it out or drop it, and the email stops being an email (#244).
describe('the Private Use code points a text layer maps to', () => {
  const cmap = (body) => `/CIDInit /ProcSet findresource begin\n${body}\nendcmap`;

  test('are none for a map that sends every glyph to a real character', () => {
    expect(
      privateUseDestinations(cmap('2 beginbfchar\n<0003> <0020>\n<0024> <0041>\nendbfchar'))
    ).toEqual([]);
  });

  test('are read from bfchar, once each however often they are mapped', () => {
    expect(
      privateUseDestinations(
        cmap('3 beginbfchar\n<0223> <E02C>\n<054C> <E06E>\n<0224> <E02C>\nendbfchar')
      )
    ).toEqual([0xe02c, 0xe06e]);
  });

  // A range maps consecutive sources upward from one destination, so a range that starts in the Private
  // Use area puts every code point it spans there — and a range may begin below it and cross in.
  test('are read from bfrange, every code point the range spans', () => {
    expect(
      privateUseDestinations(cmap('1 beginbfrange\n<0030> <0032> <E081>\nendbfrange'))
    ).toEqual([0xe081, 0xe082, 0xe083]);
    expect(
      privateUseDestinations(cmap('1 beginbfrange\n<0030> <0031> <DFFF>\nendbfrange'))
    ).toEqual([0xe000]);
  });

  // A range gives its destinations either as one code point its sources count up from or as a list with
  // one entry per source. Read as three in a row, a list's first two entries are the range's ends and its
  // third a destination to count from, which invents code points no glyph maps to — a red build on a
  // sound document, which is the worst kind of check.
  test('read a range whose destinations are a list as a list, not as a range', () => {
    expect(
      privateUseDestinations(
        cmap('1 beginbfrange\n<0030> <0032> [<0041> <E02C> <0043>]\nendbfrange')
      )
    ).toEqual([0xe02c]);
    // And a list does not swallow the range after it.
    expect(
      privateUseDestinations(
        cmap('2 beginbfrange\n<0030> <0031> [<0041> <0042>]\n<0040> <0042> <E081>\nendbfrange')
      )
    ).toEqual([0xe081, 0xe082, 0xe083]);
  });

  test('ignore a destination of several characters whose first is a real one', () => {
    expect(privateUseDestinations(cmap('1 beginbfchar\n<0100> <00660066>\nendbfchar'))).toEqual([]);
  });
});

describe('the words one reader of a text layer loses and another does not', () => {
  test('are the reference words the other read does not carry', () => {
    expect(
      wordsLostBetween(
        'Giovanni Trovato trovato.giovanni@gmail.com',
        'Giovnni Trovto trovto.giovnni@gmil.com'
      )
    ).toEqual(['Giovanni', 'Trovato', 'trovato.giovanni@gmail.com']);
  });

  test('are none when the two reads differ only in how they broke the lines', () => {
    expect(wordsLostBetween('Senior iOS\nEngineer', 'Senior\niOS Engineer')).toEqual([]);
    expect(wordsLostBetween('', 'anything')).toEqual([]);
  });

  // pdftohtml opens a run at every weight change, so it writes "Solutions" and "," where pdftotext writes
  // "Solutions," — four words called lost on a document that had lost nothing, in the very list that is
  // meant to name what went.
  test('are none where one read split a word from the punctuation beside it', () => {
    expect(
      wordsLostBetween('Cortado Mobile Solutions, Berlin', 'Cortado Mobile Solutions , Berlin')
    ).toEqual([]);
    expect(wordsLostBetween('(2020–2023):', '( 2020–2023 ) :')).toEqual([]);
    // A letter really gone is still gone.
    expect(wordsLostBetween('Trovato', 'Trovto')).toEqual(['Trovato']);
  });
});

describe('the maps a PDF carries, and the ones a reader could not find', () => {
  const pdffonts = (...rows) =>
    [
      'name                 type              encoding    emb sub uni object ID',
      '---',
      ...rows
    ].join('\n');

  test('are the embedded fonts pdffonts says carry a map, and those it says carry none', () => {
    expect(
      toUnicodeFonts(
        pdffonts(
          'AAAAAA+Inter-Bold    CID TrueType      Identity-H  yes yes yes      4  0',
          'BAAAAA+Inter-Regular CID TrueType      Identity-H  yes yes no       5  0',
          'Helvetica            Type 1            WinAnsi     no  no  yes      6  0'
        )
      )
    ).toEqual({ mapped: ['AAAAAA+Inter-Bold'], unmapped: ['BAAAAA+Inter-Regular'] });
  });

  // The bytes are read rather than an object graph walked, so a map behind a filter this does not know is
  // a map not found — which is why the audit compares this count with what pdffonts reports.
  test('are decoded from the file, flated or plain', () => {
    const cmap = '1 beginbfchar\n<0223> <E02C>\nendbfchar';
    const flated = Buffer.concat([
      Buffer.from('1 0 obj <</Length 40>>\nstream\n', 'latin1'),
      deflateSync(Buffer.from(cmap, 'latin1')),
      Buffer.from('\nendstream endobj\n', 'latin1')
    ]);
    expect(toUnicodeCmaps(flated).map(privateUseDestinations)).toEqual([[0xe02c]]);
    expect(
      toUnicodeCmaps(Buffer.from(`1 0 obj\nstream\n${cmap}\nendstream endobj\n`, 'latin1'))
    ).toHaveLength(1);
    expect(toUnicodeCmaps(Buffer.from('nothing here at all', 'latin1'))).toEqual([]);
  });
});

describe('the text of a read that trusts the map', () => {
  test('is the words, with the tags that wrap them gone and the entities decoded', () => {
    expect(
      xmlText('<text font="0"><b>Cortado</b> Mobile</text><text>Solutions</text>')
        .split(/\s+/u)
        .filter(Boolean)
    ).toEqual(['Cortado', 'Mobile', 'Solutions']);
    expect(xmlText('<text>R&amp;D &lt;tag&gt; &#8212; &quot;x&quot;</text>')).toContain('R&D');
    expect(xmlText('<text>R&amp;D &#8212; x</text>')).toContain('—');
  });
});

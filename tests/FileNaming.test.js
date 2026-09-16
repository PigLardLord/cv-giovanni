import { fileWords, nameSlug } from '../core/FileNaming.js';

// A profile without a name gets no filename, and the page offers it no download (#34). A name written as null is
// no name either: a default parameter stands in for undefined alone, and String(null) is the word "null" (#123).
describe('the words of a name, for a filename', () => {
  test.each([undefined, null, '', '  '])('%p is no name, and names no file', (name) => {
    expect(fileWords(name)).toEqual([]);
    expect(() => nameSlug(name)).toThrow(/no name/);
  });

  test('a name loses its accents, not its letters', () => {
    expect(nameSlug('Niccolò Paganini')).toBe('niccolo-paganini');
  });
});

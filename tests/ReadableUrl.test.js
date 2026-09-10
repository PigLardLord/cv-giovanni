import { readableAddress } from '../domain/ReadableUrl.js';

describe('readableAddress', () => {
  test('drops what nobody types and keeps what they do', () => {
    expect(readableAddress('https://github.com/PigLardLord')).toBe('github.com/PigLardLord');
    expect(readableAddress('https://www.linkedin.com/in/piglardlord/')).toBe(
      'linkedin.com/in/piglardlord'
    );
    expect(readableAddress('http://piglardlord.github.io/cv-giovanni/')).toBe(
      'piglardlord.github.io/cv-giovanni'
    );
  });

  // A shortened address is a wrong address: the path is the part that identifies the person.
  test('the path survives whole', () => {
    expect(readableAddress('https://sites.google.com/view/giovanni-trovato')).toBe(
      'sites.google.com/view/giovanni-trovato'
    );
  });

  test('falls back when there is nothing to show', () => {
    expect(readableAddress('', 'GitHub')).toBe('GitHub');
    expect(readableAddress('   ', 'GitHub')).toBe('GitHub');
    expect(readableAddress(undefined, 'GitHub')).toBe('GitHub');
    expect(readableAddress(null)).toBe('');
  });
});

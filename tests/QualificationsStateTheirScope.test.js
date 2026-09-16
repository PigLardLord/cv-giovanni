/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// A qualification whose name holds a word the target market reads as a degree level states its scope, in credits or
// duration (#48). A German reader hears "Master" as the Bologna second cycle, 120 ECTS on top of a bachelor's, and
// assumes that scope when the line states none: the Pisa programme carries 60. The correction would arrive at the
// certificate check.
//
// What the check can see is the word. It cannot tell a name that claims a level from one that holds it, so it holds
// to the rule the degree it was found on — a Master's — and a bachelor's named as the cycle it is stays the
// reviewer's to judge. The scope the model can state is `credits`.
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('config/cv-manifest.json');
const published = Object.values(manifest.profiles).flatMap(({ locales }) => Object.values(locales));

const MASTER = /\bMaster/i;

/** The degrees named as a Master's that state no scope. */
const unscoped = (profile) =>
  (profile.education || [])
    .filter(({ degree }) => MASTER.test(String(degree ?? '')))
    .filter(({ credits }) => !(Number.isInteger(credits) && credits > 0))
    .map(({ degree }) => degree);

describe('a qualification named for a degree level states its scope', () => {
  test.each(published)('%s', (path) => {
    expect(unscoped(read(path))).toEqual([]);
  });

  test('a Master’s with no credits is found, and a degree named for no level is not', () => {
    expect(
      unscoped({
        education: [
          { degree: "First Level Professional Master's Programme", credits: 60 },
          { degree: 'Master universitario di primo livello' },
          { degree: 'Certificate in Mobile Development' }
        ]
      })
    ).toEqual(['Master universitario di primo livello']);
  });
});

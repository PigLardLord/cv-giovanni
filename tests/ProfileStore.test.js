/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { ProfileStore } from '../core/ProfileStore.js';

// The local app reads and writes the public CV through this (#21), and so will its editor (#23). The file
// is what the page and every PDF are built from, so what reaches it is checked first, and refused with
// the reason rather than coerced.
const GENERAL = 'profiles/general/en.json';
const onDisk = readFileSync(new URL(`../${GENERAL}`, import.meta.url), 'utf8');

/** The project's files, in memory. */
const project = (files = {}) => {
  const stored = new Map(Object.entries(files));
  return {
    stored,
    readText: async (path) => {
      if (!stored.has(path)) throw new Error(`no ${path}`);
      return stored.get(path);
    },
    writeText: async (path, text) => {
      stored.set(path, text);
    }
  };
};

describe('the general profile, for the local app', () => {
  test('is read from the file the page and the PDFs are built from', async () => {
    const store = new ProfileStore(project({ [GENERAL]: onDisk }));

    expect(ProfileStore.path).toBe(GENERAL);
    expect(await store.read()).toEqual(JSON.parse(onDisk));
  });

  test('written back unchanged, changes no byte of the file', async () => {
    const files = project({ [GENERAL]: onDisk });
    const store = new ProfileStore(files);

    expect(await store.write(await store.read())).toEqual({ path: GENERAL });
    expect(files.stored.get(GENERAL)).toBe(onDisk);
  });

  test.each([
    ['nothing', null],
    ['a list', [{ name: 'Giovanni Trovato' }]],
    ['a string', 'Giovanni Trovato'],
    ['a profile with neither a name nor a title', { summary: 'Engineer' }]
  ])('refuses %s with the reason, and writes nothing', async (what, profile) => {
    const files = project({ [GENERAL]: onDisk });

    await expect(new ProfileStore(files).write(profile)).rejects.toMatchObject({
      name: 'Refusal',
      status: 422,
      message: expect.stringMatching(/\w/)
    });
    expect(files.stored.get(GENERAL)).toBe(onDisk);
  });

  test('refuses a profile without the shape the renderers read, with every problem, and writes nothing', async () => {
    const files = project({ [GENERAL]: onDisk });
    const profile = JSON.parse(onDisk);
    profile.relevant_experience[1].period = 'September 2015 – July 2018 (3 years)';
    profile.interests.push('');

    const refusal = await new ProfileStore(files).write(profile).catch((error) => error);

    expect(refusal).toMatchObject({ name: 'Refusal', status: 422 });
    expect(refusal.details.map(({ path }) => path)).toEqual([
      'relevant_experience[1].period',
      'interests[6]'
    ]);
    expect(refusal.message).toMatch(
      /relevant_experience\[1\]\.period carries a duration.*and 1 more/
    );
    expect(files.stored.get(GENERAL)).toBe(onDisk);
  });
});

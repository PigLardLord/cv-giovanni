/**
 * @jest-environment node
 */
import { Applications } from '../core/Applications.js';

// An application is an advert and a CV tailored to it, under applications/, which git ignores (#21). The
// local app creates one, matches its advert and builds its CV through this, with the same scripts the
// command line runs; tailoring is #24's.
const MANIFEST = JSON.stringify({
  defaultProfile: 'general',
  profiles: { general: { locales: { en: 'profiles/general/en.json' } } }
});
const GENERAL = '{\n  "name": "Giovanni Trovato"\n}\n';
const RAN = { exitCode: 0, signal: null, stdout: 'ran\n', stderr: '' };

/** The project's files, in memory; a directory exists when a file under it does. */
const project = (files) => {
  const stored = new Map(Object.entries(files));
  return {
    stored,
    readText: async (path) => {
      if (!stored.has(path)) throw new Error(`no ${path}`);
      return stored.get(path);
    },
    writeText: async (path, text) => {
      stored.set(path, text);
    },
    exists: async (path) =>
      [...stored.keys()].some((key) => key === path || key.startsWith(`${path}/`))
  };
};

const setup = (extra = {}) => {
  const files = project({
    'config/cv-manifest.json': MANIFEST,
    'profiles/general/en.json': GENERAL,
    ...extra
  });
  const calls = [];
  const scripts = {
    run: async (name, args) => {
      calls.push([name, args]);
      return RAN;
    }
  };
  return { files, calls, applications: new Applications({ files, scripts }) };
};
const ACME = {
  'applications/acme/en.json': GENERAL,
  'applications/acme/advert.txt': 'Senior iOS Engineer\n'
};

describe('creating an application', () => {
  test('writes the advert, and a copy of the general profile to tailor', async () => {
    const { files, applications } = setup();

    expect(await applications.create({ name: 'acme', advert: 'Senior iOS Engineer\n' })).toEqual({
      name: 'acme',
      profile: 'applications/acme/en.json',
      advert: 'applications/acme/advert.txt'
    });
    expect(files.stored.get('applications/acme/advert.txt')).toBe('Senior iOS Engineer\n');
    expect(files.stored.get('applications/acme/en.json')).toBe(GENERAL);
  });

  test.each([
    'Acme',
    'acme corp',
    '../acme',
    'acme/../general',
    '-acme',
    'acme-',
    '',
    'a'.repeat(41),
    undefined,
    42
  ])(
    'refuses the name %p, which cannot be a directory and part of every filename, and writes nothing',
    async (name) => {
      const { files, applications } = setup();

      await expect(
        applications.create({ name, advert: 'Senior iOS Engineer' })
      ).rejects.toMatchObject({
        name: 'Refusal',
        status: 422
      });
      expect(files.stored.size).toBe(2);
    }
  );

  test('refuses the name of a published profile, which would win over the application', async () => {
    const { files, applications } = setup();

    await expect(applications.create({ name: 'general', advert: 'x' })).rejects.toMatchObject({
      status: 409
    });
    expect(files.stored.size).toBe(2);
  });

  test('refuses an application that exists, and leaves it as it was', async () => {
    const { files, applications } = setup(ACME);

    await expect(
      applications.create({ name: 'acme', advert: 'Another advert' })
    ).rejects.toMatchObject({
      status: 409
    });
    expect(files.stored.get('applications/acme/advert.txt')).toBe('Senior iOS Engineer\n');
  });

  test.each([undefined, '', '  \n', 42, ['Senior iOS Engineer']])(
    'refuses the advert %p, and writes nothing',
    async (advert) => {
      const { files, applications } = setup();

      await expect(applications.create({ name: 'acme', advert })).rejects.toMatchObject({
        status: 422
      });
      expect(files.stored.size).toBe(2);
    }
  );

  test.each([null, 'acme', ['acme']])(
    'refuses a request that is not an object: %p',
    async (request) => {
      await expect(setup().applications.create(request)).rejects.toMatchObject({ status: 422 });
    }
  );
});

describe('an application that exists', () => {
  test('has its advert matched against its own CV, by the script npm run audit:ats runs', async () => {
    const { calls, applications } = setup(ACME);

    expect(await applications.match('acme')).toBe(RAN);
    expect(calls).toEqual([
      [
        'audit-ats',
        ['--profile=applications/acme/en.json', '--advert=applications/acme/advert.txt']
      ]
    ]);
  });

  test('has its CV built by the script npm run build:pdf runs', async () => {
    const { calls, applications } = setup(ACME);

    expect(await applications.build('acme')).toBe(RAN);
    expect(calls).toEqual([['generate-pdfs', ['--profile=applications/acme/en.json']]]);
  });

  test('is not tailored yet: #24 builds that on the inference #22 connects', async () => {
    const { calls, applications } = setup(ACME);

    await expect(applications.tailor('acme')).rejects.toMatchObject({
      status: 501,
      message: expect.stringContaining('#24')
    });
    expect(calls).toEqual([]);
  });
});

describe('an application that does not exist', () => {
  test.each(['match', 'build', 'tailor'])(
    'cannot be sent to %s, and no script runs',
    async (step) => {
      const { calls, applications } = setup({
        ...ACME,
        'applications/half/advert.txt': 'An advert with no CV beside it\n'
      });

      for (const name of ['nobody', 'half', '../general', 'Acme', undefined]) {
        await expect(applications[step](name)).rejects.toMatchObject({ status: 404 });
      }
      expect(calls).toEqual([]);
    }
  );
});

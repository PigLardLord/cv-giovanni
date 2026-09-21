/**
 * @jest-environment node
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFile } from '../adapters/ConfigDirectory.js';

// The API key, the token and the full CV live in the configuration directory and never inside the project, which git
// tracks and the server serves (#22, #270, #279). The check compared the path as written: a directory inside the
// project whose name starts with "..", and a link leading into it, both passed (#285).
describe('a configuration file is never inside the project', () => {
  let scratch;
  let project;
  let config;

  beforeEach(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'config-')));
    project = join(scratch, 'cv');
    config = join(scratch, 'config');
    mkdirSync(project);
    mkdirSync(config);
  });

  afterEach(() => rmSync(scratch, { recursive: true, force: true }));

  const place = (env) =>
    configFile('full-cv/en.json', { env, projectRoot: project, what: 'full CV' });

  test('outside it, the file is where the configuration directory says', () => {
    expect(place({ XDG_CONFIG_HOME: config })).toBe(join(config, 'mycv', 'full-cv', 'en.json'));
  });

  test('a directory inside it is refused, however it is named', () => {
    for (const inside of [
      join(project, 'config'),
      join(project, '..config'),
      join(project, '...')
    ]) {
      expect(() => place({ XDG_CONFIG_HOME: inside })).toThrow(
        /full CV would be inside the project/
      );
    }
  });

  test('a sibling that shares its name’s beginning is outside it', () => {
    expect(() => place({ XDG_CONFIG_HOME: `${project}-config` })).not.toThrow();
  });

  test('a link that leads into it is refused, whether it is the directory or the file', () => {
    symlinkSync(project, join(config, 'mycv'));
    expect(() => place({ XDG_CONFIG_HOME: config })).toThrow(/inside the project/);

    rmSync(join(config, 'mycv'));
    mkdirSync(join(config, 'mycv', 'full-cv'), { recursive: true });
    writeFileSync(join(project, 'en.json'), '{}');
    symlinkSync(join(project, 'en.json'), join(config, 'mycv', 'full-cv', 'en.json'));
    expect(() => place({ XDG_CONFIG_HOME: config })).toThrow(/inside the project/);
  });

  test('a project reached through a link is still the project', () => {
    const alias = join(scratch, 'alias');
    symlinkSync(project, alias);

    expect(() =>
      configFile('api-token', {
        env: { XDG_CONFIG_HOME: join(project, 'cfg') },
        projectRoot: alias
      })
    ).toThrow(/inside the project/);
  });
});

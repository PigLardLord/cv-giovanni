/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { GenerationTarget } from '../core/GenerationTarget.js';
import { fixturePair, fixturesOf, staleFixtures } from '../scripts/lib/print-fixtures.mjs';

// The print fixtures are extractions of the printed CV that tests read as the current one. Nothing checked they still
// were, and Nerd Mode's had drifted (#234): audit:print now compares them with the print it extracts.
const PRINT = {
  profile: 'general',
  locale: 'en',
  layout: 'nerd',
  text: 'Giovanni Trovato\nSenior iOS Engineer\n',
  drawn: 'Giovanni Trovato\n'
};
const reading = (fixtures) => (name) => (Object.hasOwn(fixtures, name) ? fixtures[name] : null);

describe('the print fixtures', () => {
  test('that are the print pass', () => {
    expect(
      staleFixtures(
        PRINT,
        reading({
          'page-print-general-en-nerd.txt': PRINT.text,
          'page-print-general-en-nerd.raw.txt': PRINT.drawn
        })
      )
    ).toEqual([]);
  });

  test('that are not are named, with the first line where they part', () => {
    expect(
      staleFixtures(
        PRINT,
        reading({
          'page-print-general-en-nerd.txt': 'Giovanni Trovato\niOS Engineer\n',
          'page-print-general-en-nerd.raw.txt': PRINT.drawn
        })
      )
    ).toEqual([
      {
        fixture: 'tests/fixtures/ats/page-print-general-en-nerd.txt',
        line: 2,
        printed: 'Senior iOS Engineer',
        fixed: 'iOS Engineer'
      }
    ]);
  });

  test('a fixture the print has grown past is named at the first line it lacks', () => {
    expect(
      staleFixtures(
        { ...PRINT, drawn: 'Giovanni Trovato\nSenior iOS Engineer\n' },
        reading({
          'page-print-general-en-nerd.txt': PRINT.text,
          'page-print-general-en-nerd.raw.txt': 'Giovanni Trovato\n'
        })
      )
    ).toEqual([
      {
        fixture: 'tests/fixtures/ats/page-print-general-en-nerd.raw.txt',
        line: 2,
        printed: 'Senior iOS Engineer',
        fixed: '(end)'
      }
    ]);
  });

  // The same PDF read by two versions of poppler: CI's puts a space either side of a "·" in the raw reading, and this
  // machine's does not; the next version may space a "–" or a "|" otherwise. The words and the lines are the print;
  // the spaces poppler infers are not.
  test('a space poppler infers, beside a separator or between words, is not a difference', () => {
    const links = { ...PRINT, drawn: 'github.com/ada · linkedin.com/in/ada\n' };
    expect(
      staleFixtures(
        links,
        reading({
          'page-print-general-en-nerd.txt': 'Giovanni  Trovato\nSenior iOS Engineer\n',
          'page-print-general-en-nerd.raw.txt': 'github.com/ada·linkedin.com/in/ada\n'
        })
      )
    ).toEqual([]);
  });

  test('a space poppler infers around a dash or a bar is not a difference either', () => {
    expect(
      staleFixtures(
        { ...PRINT, drawn: 'Swift – SwiftUI | iOS\n' },
        reading({
          'page-print-general-en-nerd.txt': PRINT.text,
          'page-print-general-en-nerd.raw.txt': 'Swift–SwiftUI|iOS\n'
        })
      )
    ).toEqual([]);
  });

  // Where poppler writes the page break differs by version: this machine's joins the next page's first line to it.
  test('a page break written on its own line or joined to the next is not a difference', () => {
    expect(
      staleFixtures(
        { ...PRINT, drawn: 'last line of page one.\n\fFirst line of page two\n' },
        reading({
          'page-print-general-en-nerd.txt': PRINT.text,
          'page-print-general-en-nerd.raw.txt': 'last line of page one.\fFirst line of page two\n'
        })
      )
    ).toEqual([]);
  });

  test('a line broken elsewhere is a difference', () => {
    expect(
      staleFixtures(
        PRINT,
        reading({
          'page-print-general-en-nerd.txt': 'Giovanni Trovato Senior\niOS Engineer\n',
          'page-print-general-en-nerd.raw.txt': PRINT.drawn
        })
      )
    ).toEqual([
      expect.objectContaining({
        fixture: 'tests/fixtures/ats/page-print-general-en-nerd.txt',
        line: 1
      })
    ]);
  });

  test('a layout with no fixtures has nothing to be stale', () => {
    expect(staleFixtures({ ...PRINT, layout: 'technical' }, reading({}))).toEqual([]);
  });

  // Named for the CV they are the print of, so a second published CV carries its own, held by the same check (#302).
  test('are each CV’s own: the German print is held to the German fixtures, not the English', () => {
    const german = { ...PRINT, locale: 'de', text: 'Giovanni Trovato\nSenior iOS-Entwickler\n' };
    const fixtures = reading({
      'page-print-general-en-nerd.txt': PRINT.text,
      'page-print-general-en-nerd.raw.txt': PRINT.drawn,
      'page-print-general-de-nerd.txt': 'Giovanni Trovato\niOS-Entwickler\n',
      'page-print-general-de-nerd.raw.txt': PRINT.drawn
    });

    expect(fixturesOf(german).map(({ name }) => name)).toEqual([
      'page-print-general-de-nerd.txt',
      'page-print-general-de-nerd.raw.txt'
    ]);
    expect(staleFixtures(PRINT, fixtures)).toEqual([]);
    expect(staleFixtures(german, fixtures)).toEqual([
      expect.objectContaining({ fixture: 'tests/fixtures/ats/page-print-general-de-nerd.txt' })
    ]);
  });

  // A fixture named for no published CV and layout is held by nobody, and the audit would say nothing (the review of
  // #317).
  test('on disk are each named for a published CV and a layout', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../config/cv-manifest.json', import.meta.url), 'utf8')
    );
    const named = new Set(
      GenerationTarget.published(manifest).flatMap(({ profile, locale }) =>
        manifest.layouts.flatMap((layout) =>
          fixturesOf({ profile, locale, layout }).map(({ name }) => name)
        )
      )
    );
    const onDisk = readdirSync(new URL('../tests/fixtures/ats/', import.meta.url)).filter((name) =>
      name.startsWith('page-print-')
    );

    expect(onDisk.length).toBeGreaterThan(0);
    expect(onDisk.filter((name) => !named.has(name))).toEqual([]);
  });

  test('are found by the CV the audit prints, never by a profile’s path written into it', () => {
    const audit = readFileSync(new URL('../scripts/audit-print.mjs', import.meta.url), 'utf8');

    expect(audit).not.toMatch(/['"`]profiles\//);
  });

  // A layout with no fixtures was claimed held all the same, and half a pair passed unread (#321).
  test('are named as held, and half a pair is named missing', () => {
    const pair = {
      'page-print-general-en-nerd.txt': PRINT.text,
      'page-print-general-en-nerd.raw.txt': PRINT.drawn
    };
    const print = { profile: 'general', locale: 'en', layout: 'nerd' };

    expect(fixturePair(print, reading(pair))).toEqual({
      held: ['page-print-general-en-nerd.txt', 'page-print-general-en-nerd.raw.txt'],
      missing: []
    });
    expect(fixturePair(print, reading({ 'page-print-general-en-nerd.txt': PRINT.text }))).toEqual({
      held: ['page-print-general-en-nerd.txt'],
      missing: ['tests/fixtures/ats/page-print-general-en-nerd.raw.txt']
    });
    expect(fixturePair({ ...print, layout: 'technical' }, reading(pair))).toEqual({
      held: [],
      missing: []
    });
  });
});

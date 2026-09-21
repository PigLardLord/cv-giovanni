/**
 * @jest-environment node
 */
import { staleFixtures } from '../scripts/lib/print-fixtures.mjs';

// The print fixtures are extractions of the printed CV that tests read as the current one. Nothing checked they still
// were, and Nerd Mode's had drifted (#234): audit:print now compares them with the print it extracts.
const PRINT = {
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
        reading({ 'page-print-nerd.txt': PRINT.text, 'page-print-nerd.raw.txt': PRINT.drawn })
      )
    ).toEqual([]);
  });

  test('that are not are named, with the first line where they part', () => {
    expect(
      staleFixtures(
        PRINT,
        reading({
          'page-print-nerd.txt': 'Giovanni Trovato\niOS Engineer\n',
          'page-print-nerd.raw.txt': PRINT.drawn
        })
      )
    ).toEqual([
      {
        fixture: 'tests/fixtures/ats/page-print-nerd.txt',
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
          'page-print-nerd.txt': PRINT.text,
          'page-print-nerd.raw.txt': 'Giovanni Trovato\n'
        })
      )
    ).toEqual([
      {
        fixture: 'tests/fixtures/ats/page-print-nerd.raw.txt',
        line: 2,
        printed: 'Senior iOS Engineer',
        fixed: ''
      }
    ]);
  });

  test('a layout with no fixtures has nothing to be stale', () => {
    expect(staleFixtures({ ...PRINT, layout: 'technical' }, reading({}))).toEqual([]);
  });
});

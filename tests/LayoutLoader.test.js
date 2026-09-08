import { JSDOM } from 'jsdom';
import { LayoutLoader } from '../core/LayoutLoader.js';

describe('LayoutLoader', () => {
  let document;
  let loader;

  beforeEach(() => {
    document = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
      .window.document;
    loader = new LayoutLoader(document);
  });

  const layoutLinks = () =>
    [...document.querySelectorAll('link[data-layout="true"]')];

  describe('reading the requested layout', () => {
    test('takes the name from the query string', () => {
      expect(loader.requestedLayout('?layout=classic')).toBe('classic');
    });

    test('reports nothing when no layout is asked for', () => {
      expect(loader.requestedLayout('')).toBeNull();
      expect(loader.requestedLayout('?profile=x')).toBeNull();
    });

    /*
     * The name is interpolated into a URL, so a value that can climb out of
     * the layouts directory is refused rather than resolved.
     */
    test.each([
      ['a traversal', '?layout=../../etc/passwd'],
      ['a nested path', '?layout=classic/../secret'],
      ['an absolute path', '?layout=/etc/passwd'],
      ['a protocol', '?layout=http://evil.test/x.css'],
      ['an uppercase name', '?layout=Classic'],
      ['an empty value', '?layout=']
    ])('refuses %s', (_, query) => {
      expect(loader.requestedLayout(query)).toBeNull();
    });

    test('accepts hyphenated names', () => {
      expect(loader.requestedLayout('?layout=classic-compact')).toBe('classic-compact');
    });
  });

  describe('loading', () => {
    test('adds a screen and a print stylesheet for the layout', () => {
      loader.load('classic');

      expect(layoutLinks().map((link) => [link.getAttribute('href'), link.media]))
        .toEqual([
          ['layouts/classic/screen.css', ''],
          ['layouts/classic/print.css', 'print']
        ]);
    });

    /*
     * A layout states only its differences, so it has to come after the base
     * stylesheets rather than replace them.
     */
    test('appends, leaving the base stylesheets in place', () => {
      const base = document.createElement('link');
      base.rel = 'stylesheet';
      base.href = 'style.css';
      document.head.appendChild(base);

      loader.load('classic');

      const hrefs = [...document.querySelectorAll('link')]
        .map((link) => link.getAttribute('href'));
      expect(hrefs[0]).toBe('style.css');
      expect(hrefs).toHaveLength(3);
    });

    test('loads nothing when no layout is named', () => {
      loader.load(null);
      loader.load('');

      expect(layoutLinks()).toHaveLength(0);
    });

    test('degrades quietly with no document', () => {
      expect(new LayoutLoader(null).load('classic')).toEqual([]);
    });
  });
});

import { PageMeasurer, PAGE_CONTENT_WIDTH_MM } from '../core/PageMeasurer.js';

/** Builds a document whose print stylesheet and body are inspectable. */
function makeDocument({ scrollHeightPx = 2010, blocks = [] } = {}) {
  const printLink = { rel: 'stylesheet', media: 'print', href: 'print.css' };
  const screenLink = { rel: 'stylesheet', media: '', href: 'style.css' };
  const footers = {
    style: {
      _v: '', _p: '',
      getPropertyValue(name) { return name === 'display' ? this._v : ''; },
      getPropertyPriority(name) { return name === 'display' ? this._p : ''; },
      setProperty(name, value, priority = '') {
        if (name === 'display') { this._v = value; this._p = priority; }
      },
      removeProperty(name) {
        if (name === 'display') { this._v = ''; this._p = ''; }
      }
    }
  };
  const seen = [];

  const body = {
    style: { width: '' },
    get scrollHeight() {
      // Only report the print height while the sheet is actually applied —
      // that is the whole contract this class rests on.
      seen.push(printLink.media);
      return printLink.media === 'all' ? scrollHeightPx : 2680;
    },
    getBoundingClientRect: () => ({ top: 0, height: 0 })
  };

  return {
    body,
    printLink,
    screenLink,
    footers,
    seen,
    querySelector(selector) {
      return selector === '.page-footers' ? footers : null;
    },
    querySelectorAll(selector) {
      if (selector === 'link[rel="stylesheet"]') return [printLink, screenLink];
      return blocks;
    }
  };
}

describe('PageMeasurer', () => {
  test('measures with the print stylesheet applied', () => {
    const doc = makeDocument({ scrollHeightPx: 2010 });
    const measurer = new PageMeasurer(doc);

    const height = measurer.documentHeightMm();

    expect(doc.seen).toContain('all');
    expect(height).toBeCloseTo(2010 * 25.4 / 96, 3);
  });

  test('clamps the body to the A4 content box while measuring', () => {
    const doc = makeDocument();
    let widthDuring = null;
    new PageMeasurer(doc).withPrintLayout(() => {
      widthDuring = doc.body.style.width;
    });

    expect(widthDuring).toBe(`${PAGE_CONTENT_WIDTH_MM}mm`);
  });

  /*
   * The footers are absolutely positioned at `page-index × 267mm`, so they
   * stretch the document to whatever count they were last rendered for. Left
   * visible, they make any page count confirm itself — the reason a one-page
   * CV kept the blank second sheet its own footer had created.
   */
  test('hides the footers while measuring, so they cannot inflate the height', () => {
    const doc = makeDocument();
    let displayDuring = null;
    let priorityDuring = null;
    new PageMeasurer(doc).withPrintLayout(() => {
      displayDuring = doc.footers.style.getPropertyValue('display');
      priorityDuring = doc.footers.style.getPropertyPriority('display');
    });

    expect(displayDuring).toBe('none');
    // `print.css` sets `display: block !important` on this container: without
    // matching that priority the override does nothing at all.
    expect(priorityDuring).toBe('important');
    expect(doc.footers.style.getPropertyValue('display')).toBe('');
  });

  test('restores media and width afterwards', () => {
    const doc = makeDocument();
    doc.body.style.width = '900px';

    new PageMeasurer(doc).documentHeightMm();

    expect(doc.printLink.media).toBe('print');
    expect(doc.screenLink.media).toBe('');
    expect(doc.body.style.width).toBe('900px');
  });

  test('restores the page even when the measurement throws', () => {
    // A reader must never be left looking at a page clamped to 168mm.
    const doc = makeDocument();
    const measurer = new PageMeasurer(doc);

    expect(() => measurer.withPrintLayout(() => {
      throw new Error('boom');
    })).toThrow('boom');

    expect(doc.printLink.media).toBe('print');
    expect(doc.body.style.width).toBe('');
  });

  test('leaves screen-only stylesheets alone', () => {
    const doc = makeDocument();
    let mediaDuring = null;
    new PageMeasurer(doc).withPrintLayout(() => {
      mediaDuring = doc.screenLink.media;
    });

    expect(mediaDuring).toBe('');
  });

  test('measures blocks in document order', () => {
    const blocks = [
      { getBoundingClientRect: () => ({ top: 0, height: 378 }) },
      { getBoundingClientRect: () => ({ top: 378, height: 189 }) }
    ];
    const doc = makeDocument({ blocks });

    const measured = new PageMeasurer(doc).measureBlocks('.job-highlights li');

    expect(measured).toHaveLength(2);
    expect(measured[0].topMm).toBeCloseTo(0, 3);
    expect(measured[1].topMm).toBeCloseTo(378 * 25.4 / 96, 3);
    expect(measured[1].heightMm).toBeCloseTo(189 * 25.4 / 96, 3);
  });

  test('degrades quietly with no document', () => {
    const measurer = new PageMeasurer(null);

    expect(measurer.canMeasure()).toBe(false);
    expect(measurer.documentHeightMm()).toBe(0);
    expect(measurer.measureBlocks('li')).toEqual([]);
  });
});

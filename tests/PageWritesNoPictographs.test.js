/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// A pictograph written into the page is copied by every reader who selects the text beside it: the
// contact card's pin went into application forms as "📍 Bad Liebenstein, Thuringia, Germany" (#83).
// Decoration belongs to the stylesheet, which draws it and never hands it to a selection.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** Every text node in the body that carries a pictograph, outside scripts and styles. */
const writtenPictographs = (document) => {
  const walker = document.createTreeWalker(
    document.body,
    document.defaultView.NodeFilter.SHOW_TEXT
  );
  const found = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('script, style, template')) continue;
    if (PICTOGRAPH.test(node.textContent)) found.push(node.textContent.trim());
  }
  return found;
};

describe('the page writes no pictograph a selection would copy', () => {
  test('the check finds one when it is written', () => {
    const { document } = new JSDOM(
      '<body><div class="contact-item"><span>📍</span><span>Berlin</span></div></body>'
    ).window;

    expect(writtenPictographs(document)).toEqual(['📍']);
  });

  test('index.html writes none', () => {
    const { document } = new JSDOM(html).window;

    expect(writtenPictographs(document)).toEqual([]);
  });
});
